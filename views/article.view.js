// article.view.js
import path from 'path'
import { fileURLToPath } from 'url'
import { loadFile, parseTemplate } from '../util.js'
import { JSDOM } from 'jsdom'
import { rehype } from 'rehype'
import rehypePrism from 'rehype-prism-plus'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// *.model.js
import { Article } from '../models/article.model.js';
import { Category } from '../models/category.model.js';

const articleStructure = {
    generateTags: (indexedDocument) => {
        // Simple function to generate lightweight HTML for tags
        let tags = '';
        indexedDocument.tags.forEach(function(item) {
            tags += `<a href="/tag/${item.split(' ').join('-')}"><span>#</span>${item}</a>`
        });
        return tags;
    },
    singlePost: async (indexedArticle, promotionalSource, req, alternativeStoryStructure) => {
        // Files loaded using `loadFile` to ensure CSS efficiency
        // Generate the name of the file
        let fileName = (alternativeStoryStructure == undefined) ? 'single.component.html' : `${alternativeStoryStructure}.component.html`;
        const getSinglePost = await loadFile(`${path.join(__dirname, '../')}/outputs/components/archive/posts/${fileName}`, fileName, req);
        // Get it's category
        let category = await Category.findOne({ title: indexedArticle.category });

        promotionalSource = promotionalSource || ''
        
        // Return standard attributes for an archive story
        return parseTemplate(getSinglePost, {
            'title' : indexedArticle.titles[0].title,
            'description' : indexedArticle.description,
            'canonicalName' : indexedArticle.canonicalName,
            'image' : `/images/intro-images/${indexedArticle.canonicalName}.webp`,
            'lazyLoading' : 'loading="lazy"',
            'qualifiedUrl' : process.env.rootUrl + 'article/' + indexedArticle.canonicalName + promotionalSource,
            'icon' : indexedArticle.icon,
            'categoryTitle' : category.displayTitle,
            'categoryCanonicalName' : category.title,
            'categoryColor' : category.color[0],
            'tags' : articleStructure.generateTags(indexedArticle)
        }) || "";
    },
    generateArchiveArticles: async (category, page, req, customFormat) => {
        // Figure out how many posts per page
        if(typeof page == "undefined" || page === 0) {
            page = 0; // Set to a number to avoid errors
        }
        // Configuration from .env
        let perPage = parseFloat(process.env.postsPerPage);
        if(page === 0) {
            perPage = parseFloat(process.env.firstPagePosts);
        }
        let postStructure = customFormat || process.env.postStructure.split(',');
        if(category == "email") {
            postStructure = customFormat || process.env.emailStructure.split(',');
        }
        let modifier = 0;
        // Last element in the post structure config - repeated for remaining items
        let lastEl = postStructure[postStructure.length - 1];
        // Store for data
        let allDocuments;
        // Store current post position
        let currentPost = 0;
        // Source is used to identify which links are from emails for GA
        let source;

        // Two loops to figure out how many remaining "elements" to push to postStructure
        for(let x in postStructure) {
            if(x.indexOf('*') > -1) {
                ++modifier;
            }
        }
        // Populate remainder of the array
        while(postStructure.length <= perPage + modifier) {
            postStructure.push(lastEl);
        }

        // For giving custom links to emails
        if(category == "email") {
            source = '?utm_source=promo_email&utm_medium=email'
        }

        // Get data from correct place
        if(typeof category == "undefined" || category == "home" || category == "email") {
            // No category - all posts
            allDocuments = await Article.find({ "mainPage" : { $ne : false }, "published" : true }).sort('-date').limit(perPage).skip(perPage * page);
        } else {
            // Category
            allDocuments = await Article.find({ category: category,  "mainPage" : { $ne : false }, "published" : true }).sort('-date').limit(perPage).skip(perPage * page);
        }
        
        // Get the file for the number of posts
        const getFile = async (numberOfPosts, nameOfFile) => {
            let single = (nameOfFile == undefined) ? "one" : nameOfFile
            let multiple = (nameOfFile == undefined) ? "multiple" : nameOfFile
            let fileName = (parseFloat(numberOfPosts) > 1) ? `${single}.component.html` : `${multiple}.component.html`;

            if(numberOfPosts.indexOf('*') > -1 && page == 0 || numberOfPosts.indexOf('*') === -1) {
                let getFile = await loadFile(`${path.join(__dirname, '../')}/outputs/components/archive/${fileName}`, fileName, req);

                return [ fileName, getFile ];
            }
            else {
                return undefined;
            }
        }

        let output = '';
        for(let key in postStructure) {
            let item = postStructure[key];
            let getPage = item.split(':');
            let formatFile = await getFile(getPage[0], getPage[1]);
            if(formatFile == undefined) {
                continue;
            }
            // Get the file to populate postFormat
            let createPosts = '';
            for(let i = 0; i < parseFloat(getPage[0]); ++ i) {
                if(currentPost < perPage) {
                    let alternativeStructure = (getPage[2] === undefined) ? undefined : getPage[2];
                    if(allDocuments[currentPost] !== undefined) {
                        createPosts += await articleStructure.singlePost(allDocuments[currentPost], source, req, alternativeStructure);
                    }
                    ++currentPost;
                }
            }
            if(createPosts !== '') {
                let replacementObject = {
                    content: createPosts
                }
                try {
                    let advert = await loadFile(`${path.join(__dirname, '../')}/outputs/generic/advert.generic.html`, 'advert.generic.html', req)
                    replacementObject.advert = advert;
                }
                catch(e) {
                    // no advert file. oh well
                    console.log(e);
                }
                let replaceContents = await parseTemplate(formatFile[1], replacementObject);
                output += replaceContents
            }
        }
        return output;
    },
    singleColumn: async function(term, offset, req, search) {
        try {
            let output = '';
            let allDocuments;
            if(typeof offset == "undefined") {
                offset = 0;
            }
            if(search === true) {
                term = `(?=.*${term.split(' ').join(')(?=.*')})`;
                allDocuments = await Article.find({ 'titles.title' : { "$regex": term, "$options": "i" } }).sort('-date').limit(parseFloat(process.env.postsPerPage)).skip(offset * parseFloat(process.env.postsPerPage));
            }
            else {
                term = term.split('-').join(' ');
                allDocuments = await Article.find({ 'tags' : `${term}` }).sort('-date').limit(parseFloat(process.env.postsPerPage)).skip(offset * parseFloat(process.env.postsPerPage));
            }
            
            if(allDocuments.length > 0) {
                for(let i = 0; i < allDocuments.length; ++i) {
                    output += await articleStructure.singlePost(allDocuments[i], '', req);
                }
            } 
            else if(offset === 0) {
                output += "<h2>No posts yet..</h2>"
            }
            else {
                output = '';
            }
            return output;
        } catch(e) {
            console.log(e);
        }
    },
    generateMore: async function(exclude, category) {
        try {
            let getArticles;
            let html = '';
            if(typeof exclude !== "undefined" && typeof category !== "undefined") {
                getArticles = await Article.aggregate([{ 
                    $match: {
                        category: category,
                        canonicalName: { $not: { $eq: exclude } }
                    }
                }, {
                    $sample: { size: 8 } 
                }])
            } else {
                getArticles = await Article.aggregate([{
                    $sample: { size: 5 } 
                }])
            }
            if(getArticles.length > 0) {
                for(let i = 0; i < getArticles.length; ++i) {
                    if(typeof getArticles[i].titles !== "undefined" && typeof getArticles[i].titles[0] !== "undefined") {
                        html += `<li><a href="/article/${getArticles[i].canonicalName}">${getArticles[i].titles[0].title}</a></li>`;
                    }
                }
            } else {
                html += `<li>No Relevant Articles to Display.</li>`;
            }
            return html;

        } catch(e) {
            console.log(e);
        }
    },
    parseCode: async (codeOutput) => {
        let dom = new JSDOM(`<!DOCTYPE html><html><body id="main">${codeOutput}</body></html>`);
        if(dom.window.document.querySelectorAll('pre code').length > 0) {
            await dom.window.document.querySelectorAll('pre code').forEach(async function(item) {
                let language = item.getAttribute('class');
                if(language !== null && language !== '') {
                    if(language.indexOf('-') > -1) {
                        language = language.split('-')[1];
                    }
                    try {
                        // Code Options Menu
                        const newEl = dom.window.document.createElement('div');
                        newEl.innerHTML = `<span class="copy"></span>`;
                        newEl.classList.add('code-options');
                        
                        item.classList.add(`language-${item.getAttribute('class')}`);
                        item.textContent = item.innerHTML.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').toString();
                        
                        const getCodeValue = await rehype().use(rehypePrism, { showLineNumbers: true }).process(item.parentElement.outerHTML);
                        const mergeCode = new JSDOM(`<!DOCTYPE html><html><body id="main">${getCodeValue.value}</body></html>`);
                        if(mergeCode.window.document.querySelector('code').children[0].textContent.trim() == '') {
                            mergeCode.window.document.querySelector('code').children[0].remove();
                            mergeCode.window.document.querySelectorAll('code > span').forEach(function(item) {
                                item.setAttribute('line', parseFloat(item.getAttribute('line')) - 1);
                            });
                        }
                        item.parentNode.prepend(newEl);
                        item.innerHTML = mergeCode.window.document.querySelector('code').innerHTML;
                    }
                    catch(e) {
                        console.log(e);
                    }
                }
            });
        }
        return dom.window.document.getElementById('main').innerHTML
    }
}

export { articleStructure }