import { fileURLToPath } from 'url'
import path from 'path'
import CleanCSS from 'clean-css'
import fs from 'fs'
import sanatizeFilename from 'sanitize-filename'
import { v4 as uuid } from 'uuid'
import { rehype } from 'rehype'
import mongoose from 'mongoose'
import md from 'markdown-it'
import { md5 } from 'hash-wasm'
import { parseHTML } from 'linkedom'
import rehypePrism from 'rehype-prism-plus'
import { createClient } from 'redis'
import _ from 'lodash'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cleanCss = new CleanCSS({});

import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '../', '.env') });

// Models
import { Article } from '../models/article.model.js';
import { Series } from '../models/series.model.js';
import { Quiz } from '../models/quiz.model.js';
import { Category } from '../models/category.model.js';
import { Author } from '../models/author.model.js'

// Redis Connection
const client = createClient();
client.on('error', (err) => console.log('Redis Client Error', err));
await client.connect();

// Mongoose connection
mongoose.connect(process.env.mongooseUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// Allows converting strings to models
const datasets = {
    "article" : Article,
    "quiz" : Quiz,
    "category" : Category,
    "series" : Series,
    "author" : Author
}

// For if data type has an associated file.
const datasetFiles = {
    "article" : true,
    "quiz" : false,
    "category" : false,
    "series" : false,
    "author" : false
}


const parseMarkdown = (file, md) => {

    const blockAddonForMarkdown = (md) => {
        let sectionRegex = /\!\!\[(.*?)\]\(\{(.*?)\}\)/gsm;
        let codepenRegex = /{%\scodepen\s<a\shref="[^"]+"\s(.*?)>https:\/\/codepen.io\/(.*?)\/pen\/(.*?)<\/a>\s%}/gsm;
        md.renderer.backuprender = md.renderer.render;
    
        md.renderer.render = function (tokens, options, env) {
            let result = md.renderer.backuprender(tokens, options, env);
            if (result.match(sectionRegex)) {
                result = result.replace(sectionRegex, '<div class="fl"><div class="inline-box outlined"><h3>$1</h3><p>$2</p></div></div>');
            }
            if (result.match(codepenRegex)) {
                result = result.replace(codepenRegex, `<div class="fl" style="margin: 0 0 2rem 0;"><p class="codepen" data-height="300" data-default-tab="html,result" data-slug-hash="$3" data-user="$2" style="height: 300px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2px solid; margin: 1em 0; padding: 1em;"><span><a href="https://codepen.io/$2/pen/$3">See the original demo here.</a></span></p><script async src="https://cpwebassets.codepen.io/assets/embed/ei.js"></script></a></div>`);
            }
            return result;
        };
        return md;
    }
    
    let markdownIt = blockAddonForMarkdown(md({
        html:         true,
        xhtmlOut:     false,
        breaks:       false,
        langPrefix:   'language-',
        linkify:      true,
        typographer:  true,
        quotes: '“”‘’'
    }))
    
    const defaultRender = markdownIt.renderer.rules.link_open || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };
    
    markdownIt.renderer.rules.link_open = function (tokens, idx, options, env, self) {
        // If you are sure other plugins can't add `target` - drop check below
        let aIndex = tokens[idx].attrIndex('target');

        if (aIndex < 0) {
            tokens[idx].attrPush(['target', '_blank']); // add new attribute
        } else {
            tokens[idx].attrs[aIndex][1] = '_blank';    // replace value of existing attr
        }

        // pass token to default renderer.
        return defaultRender(tokens, idx, options, env, self);
    };

    markdownIt.renderer.rules.image = function (tokens, idx, options, env, self) {
        let token = tokens[idx];
        let aIndex = token.attrIndex('src');
        let altText = token.attrIndex('alt');
        if(typeof token?.attrs[altText][1] !== undefined) {
            altText = token?.attrs[altText][1]
        }
        if(typeof token?.attrs[aIndex] !== "undefined" && typeof token?.attrs[aIndex][1] !== "undefined" && token?.attrs[aIndex][1] !== "") {
            let fileName = token.attrs[aIndex][1];
            let altFileName = token.attrs[aIndex][1];
            let fileType = fileName.split('.');
            
            // Update Urls if needed
            if(fileName.split('/').length == 1 && fileName.split('.').length == 1) {
                let tempName = fileName;
                fileName = `/images/misc/${tempName}.png`;
                altFileName = `/images/misc/${tempName}.webp`;
            }
            else if(fileName.split('/').length == 1 && fileName.split('.').length > 1) {
                let tempName = fileName.split('.')[0];
                fileName = `/images/misc/${tempName}.png`;
                altFileName = `/images/misc/${tempName}.webp`;
            }
            else if(fileName.split('.').length > 1) {
                let tempFileType = fileName.split('.')[fileName.split('.').length - 1];
                let tempName = fileName.split('.').slice(0, -1).join('.');
                if(tempFileType !== "webp") {
                    fileName = `${tempName}.${tempFileType}`
                    altFileName = `${tempName}.webp`;
                }
            }

            return `
            <p><picture>
                <source srcset="${altFileName}" type="image/webp">
                <img src="${fileName}" alt="${altText}" />
            </picture></p>`
        }
        // pass token to default renderer.
        return defaultRender(tokens, idx, options, env, self);
    };

    return markdownIt.render(file)

}

const parseFileCode = async (file) => {
    const { document } = parseHTML(`<!DOCTYPE html><html><body id="main">${file}</body></html>`);
    if(document.querySelectorAll('pre code').length > 0) {
        await document.querySelectorAll('pre code').forEach(async function(item) {
            let language = item.getAttribute('class');
            if(language !== null && language !== '') {
                if(language.indexOf('-') > -1) {
                    language = language.split('-')[1];
                }
                try {
                    // Code Options Menu
                    const newEl = document.createElement('div');
                    newEl.innerHTML = `<span class="copy"></span>`;
                    newEl.classList.add('code-options');
                    
                    item.classList.add(`language-${item.getAttribute('class')}`);
                    item.textContent = item.innerHTML.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&').toString();
                    
                    const getCodeValue = await rehype().use(rehypePrism, { showLineNumbers: true, ignoreMissing: true }).process(item.parentElement.outerHTML);
                    const merge = parseHTML(`<!DOCTYPE html><html><body id="main">${getCodeValue.value}</body></html>`);
                    if(merge.document.querySelector('code').children[0].textContent.trim() == '') {
                        merge.document.querySelector('code').children[0].remove();
                        merge.document.querySelectorAll('code > span').forEach(function(item) {
                            item.setAttribute('line', parseFloat(item.getAttribute('line')) - 1);
                        });
                    }
                    item.parentNode.prepend(newEl);
                    item.innerHTML = merge.document.querySelector('code').innerHTML;
                }
                catch(e) {
                    console.log(e);
                }
            }
        });
    }

    return document.body.innerHTML
}

const pwaCache = (cachedData) => {
    // These are all the pages to cache for the user, so that they can use the latest content in the PWA.
    let cacheContent = [];
    if(cachedData.article !== null) {
        cacheContent = cachedData?.article?.splice(0, 10);
        cacheContent = cacheContent.map((x) => `/article/${x.canonicalName}`);
    }
    if(cachedData.category !== null) {
        let categories = cachedData.category.map((x) => `/category/${x.canonicalName}`);
        cacheContent = [ ...categories, ...cacheContent ];
    }


    if(cacheContent.length === 0) {
        return JSON.stringify([])
    }
    else {
        return JSON.stringify(cacheContent);
    }
}

const consolidateCssAsync = async (additionalStyles, req, urlHash) => {
    return new Promise(async (resolve) => {
        let css, compressCss, commonJs;
        let asyncCss, compressAsyncCss;
        try {
            css = await fsPromise('./common.css') || "";
            try {
                css += await fsPromise('./views/common/style.css');
            }
            catch(e) {
                console.log(e);
            }
            asyncCss = await fsPromise('./async.css') || "";
            commonJs = await fsPromise('./common.js') || "";
        } 
        catch(e) {
            css = '';
            asyncCss = '';
            commonJs = '';
        }        

        if(additionalStyles !== undefined) {
            css += additionalStyles;
        }
        if(req.session.fileCache !== undefined) {
            try {
                Object.keys(req.session.fileCache).forEach(function(item) {
                    if(req.session.fileCache[item].css !== undefined) {
                        css += req.session.fileCache[item].css;
                    }
                    if(req.session.fileCache[item].asyncCss !== undefined) {
                        asyncCss += req.session.fileCache[item].asyncCss;
                    }
                })
                compressCss = cleanCss.minify(css).styles;
                compressAsyncCss = cleanCss.minify(asyncCss).styles;
            } catch(e) {
                compressCss = css;
                compressAsyncCss = asynCss;
                console.log('Issue compressing CSS');
                resolve(JSON.stringify({"error" : "Issue compressing CSS and JS"}))
            }
        }
        let compressedCode = {
            css: compressCss,
            asyncCss: compressAsyncCss,
            js: commonJs
        }
        await client.set(urlHash, JSON.stringify(compressedCode));
        resolve(compressedCode);
    });
}

const consolidateCss = async (additionalStyles, req) => {
    let urlHash = await md5(req.originalUrl);
    let getRedis = await client.get(urlHash);
    let compressedCode;
    if(getRedis !== null) {
        try {
            compressedCode = JSON.parse(getRedis);
            consolidateCssAsync(additionalStyles, req, urlHash);
            return compressedCode;
        }
        catch(e) {
            console.log(e);
        }
    }
    else {
        compressedCode = await consolidateCssAsync(additionalStyles, req, urlHash);
    }

    return compressedCode;
}

const parent = function(el, match, last) {
	var result = [];
	for (var p = el && el.parentElement; p; p = p.parentElement) {
		result.push(p);
		if(p.matches(match)) {
			break;
		}
	}
	if(last == 1) {
	    return result[result.length - 1];
	} else {
		return result;
	}
}

const shuffle = (array) => {
    let currentIndex = array.length,  randomIndex;
    // While there remain elements to shuffle.
    while (currentIndex != 0) {

        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [ array[randomIndex], array[currentIndex] ];
    }

    return array;
}

const parseDataTables = async (loadedContent, req, recursive, post, cache) => {
    const { document } = parseHTML(`<!DOCTYPE html><html><body id="main">${loadedContent}</body></html>`);
    let allDataElements = [ ...document.querySelectorAll('data, config'), ...document.querySelectorAll('data data') ];
    // Generate IDs and Data...
    
    let cachedData = cache;
    let timerId = uuid();
    for(let item of allDataElements) {
        // Give each item a custom ID, and generate their IDs
        let customId = uuid();
        let topLevelData = true;

        // Parse for POST requests
        if(post === true && req.body !== undefined && typeof req.body == "object") {
            let allAttributes = item.getAttributeNames();
            for(let attr of allAttributes) {
                let thisAttribute = item.getAttribute(attr);
                if(thisAttribute !== null && thisAttribute.indexOf('$') > -1) {
                    thisAttribute = thisAttribute.split('$')[1];
                    if(req.body[`${thisAttribute}`] !== undefined) {
                        item.setAttribute(attr, req.body[`${thisAttribute}`]);
                    }
                    else {
                        item.removeAttribute(attr);
                    }
                }
            }
        }

        item.setAttribute('data-id', customId);
        let table = item.getAttribute('table') || undefined;
        let limit = item.getAttribute('limit') || undefined;
        let filter = item.getAttribute('filter') || undefined;
        let related = item.getAttribute('items-with-parents') || item.getAttribute('item-with-parents') || undefined;
        let filterOn = item.getAttribute('filter-on') || undefined;
        let sort = item.getAttribute('sort') || undefined;
        let search = item.getAttribute('search') || undefined;
        let skip = item.getAttribute('skip') || undefined;
        let populate = item.getAttribute('populate') || undefined;
        let relatedFilter;

        let checkForDataParent = parent(item, 'data', 1);
        if(checkForDataParent.tagName == "DATA") {
            topLevelData = false;
        }

        if(filter !== undefined && filter.indexOf(':') > -1) {
            filter = filter.split(':')[1];
            if(req.params?.[`${filter}`] !== undefined) {
                filter = req.params[`${filter}`];
            }
        }

        if(table !== undefined && table !== "" && table !== null) {
            let getFinalData = cachedData?.[`${table}`];
            let gatherData;
            if(limit !== undefined) {
                limit = !isNaN(parseFloat(limit)) ? parseFloat(limit) : undefined
            }
            if(skip !== undefined) {
                skip = !isNaN(parseFloat(skip)) ? parseFloat(skip) : undefined
            }
            if(datasets[`${table}`] !== undefined) {
                if(cachedData?.[`${table}`] == undefined) {
                    if(filter !== undefined && filterOn !== undefined && related === undefined) {
                        if(search == "true") {
                            gatherData = datasets[`${table}`].find({ [filterOn] : { $regex: `${filter}`, $options: "i" } });
                        }
                        else {
                            gatherData = datasets[`${table}`].find({ [filterOn] : `${filter}` });
                        }
                    }
                    else if(related !== undefined) {
                        try {
                            let findTop = req.session.data?.find((x) => x.main === true);
                            if(findTop?.data !== undefined && findTop?.totalDocuments == 1 && findTop?.data?.[0]?.[`${related}`] !== undefined || req.session.currentLoopData !== undefined) {
                                relatedFilter = findTop?.data?.[0]?.[`${related}`];
                                if(req.session.currentLoopData !== undefined) {
                                    relatedFilter = req.session.currentLoopData?.[`${related}`];
                                    if(filterOn !== undefined) {
                                        if(datasets[`${table}`]?.schema?.tree?.[`${filterOn}`] == undefined) {
                                            return JSON.stringify({ "error" : "The filter-on value you selected doesn't exist on the data model. Check it exists."});
                                        }
                                        else {
                                            gatherData = datasets[`${table}`].find({ [filterOn] : `${relatedFilter}` });
                                        }
                                    }
                                    else {
                                        if(datasets[`${table}`]?.schema?.tree?.[`${related}`] == undefined) {
                                            return JSON.stringify({ "error" : "The items-with-parents value you selected doesn't exist on the data model. Check it exists."});
                                        }
                                        else {
                                            gatherData = datasets[`${table}`].find({ [related] : `${relatedFilter}` });
                                        }
                                    }
                                }
                                else {
                                    if(filterOn !== undefined) {
                                        related = filterOn
                                    }
                                    if(relatedFilter !== undefined) {
                                        gatherData = datasets[`${table}`].find({ [related] : `${relatedFilter}` });
                                    }
                                    else {
                                        gatherData = datasets[`${table}`].find();
                                    }
                                }
                            }
                            else {
                                gatherData = datasets[`${table}`].find();
                            }
                        } catch(e) {
                            console.log(e);
                            gatherData = datasets[`${table}`].find();
                        }
                    }
                    else if(sort == "random" && limit !== undefined) {
                        gatherData = datasets[`${table}`].aggregate([{
                            $sample: { size: parseFloat(limit) } 
                        }])
                    }
                    else if(sort == "random" && filter !== undefined && filterOn !== undefined) {
                        gatherData = await datasets[`${table}`].aggregate([{ 
                            $match: {
                                [filterOn] : `${filter}`
                            }
                        }, {
                            $sample: { size: 8 } 
                        }])
                    }
                    else {
                        gatherData = datasets[`${table}`].find();
                    }

                    if(skip !== undefined) {
                        gatherData = gatherData.skip(skip);
                    }
                    if(limit !== undefined) {
                        gatherData = gatherData.limit(limit);
                    }
                    
                    if(datasets[`${table}`]?.schema?.tree?.associatedWith !== undefined && sort !== "random" || populate !== undefined) {
                        let associateItems = [];
                        if(datasets[`${table}`]?.schema?.tree?.associatedWith !== undefined) {
                            associateItems = Object.keys(datasets[`${table}`]?.schema?.tree?.associatedWith);
                        }
                        let populateItems = [];
                        if(populate !== undefined) {
                            for(let x of populate.split(' ')) {
                                populateItems.push(x);
                            }
                        }    
                        for(let x of populateItems) {
                            gatherData = gatherData.populate(x)
                        }
                        for(let x of associateItems) {
                            if(x !== "type" && x !== "required") {
                                gatherData = gatherData.populate(`associatedWith.${x}`)
                            }
                        }
                    }
                    if(sort !== undefined) {
                        gatherData = gatherData.sort(sort);
                    }
                    getFinalData = await gatherData.lean().exec();
            
                    if([ limit, filter, related, filterOn, sort ].every((x) => x == undefined)) {
                        if(req.session.fullData == undefined) {
                            req.session.fullData = {};
                        }
                        if(!Array.isArray(getFinalData)) {
                            getFinalData = [ getFinalData ];
                        }
                        req.session.fullData[`${table}`] = {
                            data: getFinalData
                        }
                    }
                } else {         
                    if(filterOn !== undefined) {
                        if(filterOn.indexOf('.') > -1) {
                            filterOn = filterOn.split('.');
                        }
                    } 
                    if(filter !== undefined && filterOn !== undefined && related === undefined) {
                        if(search == "true") {
                            let searchArray = filter.split(' ');
                            getFinalData = cachedData?.[`${table}`]?.filter((i) => {
                                let data = i[`${filterOn}`];
                                if(Array.isArray(filterOn)) {
                                    data = i;
                                    for(let x of filterOn) {
                                        if(data[`${x}`] !== undefined) {
                                            data = data[`${x}`];
                                        }
                                    }
                                }
                                let checkReturn = true;
                                for(let x of searchArray) {
                                    let regexExp = new RegExp(`${_.escapeRegExp(x)}`, "gmi");
                                    if(!data.match(regexExp)) {
                                        checkReturn = false;   
                                    }
                                }
                                return checkReturn;
                            });
                        }
                        else {
                            getFinalData = cachedData?.[`${table}`]?.filter((i) => {
                                let data = i[`${filterOn}`];
                                if(Array.isArray(filterOn)) {
                                    data = i;
                                    for(let x of filterOn) {
                                        if(data[`${x}`] !== undefined) {
                                            data = data[`${x}`];
                                        }
                                    }
                                }
                                if(Array.isArray(data)) {
                                    return data.indexOf(filter) > -1
                                }
                                else {
                                    return data == filter
                                }
                            });
                        }
                    }
                    else if(related !== undefined) {
                        try {
                            let findTop = req.session.data?.find((x) => x.main === true);
                            if(findTop?.data !== undefined && findTop?.totalDocuments == 1 && findTop?.data?.[0]?.[`${related}`] !== undefined || req.session.currentLoopData !== undefined) {
                                relatedFilter = findTop?.data?.[0]?.[`${related}`];
                                if(req.session.currentLoopData !== undefined) {
                                    relatedFilter = req.session.currentLoopData?.[`${related}`];
                                    if(filterOn !== undefined) {                                    
                                        if(Object.keys(cachedData?.[`${table}`]?.[0])?.indexOf(filterOn) == -1) {
                                            return JSON.stringify({ "error" : "The filter-on value you selected doesn't exist on the data model. Check it exists."})
                                        }
                                        else {
                                            getFinalData = cachedData?.[`${table}`]?.filter((i) => {
                                                let data = i[`${filterOn}`]
                                                if(Array.isArray(filterOn)) {
                                                    data = i;
                                                    for(let x of filterOn) {
                                                        if(data[`${x}`] !== undefined) {
                                                            data = data[`${x}`];
                                                        }
                                                    }
                                                }

                                                if(Array.isArray(data)) {
                                                    return data.indexOf(relatedFilter) > -1
                                                }
                                                else {
                                                    return data == `${relatedFilter}`
                                                }
                                
                                            });
                                        }
                                    }
                                    else {
                                        if(Object.keys(cachedData?.[`${table}`]?.[0])?.indexOf(filterOn) == -1) {
                                            return JSON.stringify({ "error" : "The items-with-parents value you selected doesn't exist on the data model. Check it exists."})
                                        }
                                        else {
                                            getFinalData = cachedData?.[`${table}`]?.filter((i) => {
                                                let data = i[`${related}`];
                                                if(Array.isArray(filterOn)) {
                                                    data = i;
                                                    for(let x of filterOn) {
                                                        if(data[`${x}`] !== undefined) {
                                                            data = data[`${x}`];
                                                        }
                                                    }
                                                }

                                                if(Array.isArray(data)) {
                                                    return data.indexOf(relatedFilter) > -1
                                                }
                                                else {
                                                    return data == `${relatedFilter}`
                                                }
                                            
                                            });
                                        }
                                    }
                                }
                                else {
                                    if(filterOn !== undefined) {
                                        related = filterOn
                                    }
                                    if(relatedFilter !== undefined) {
                                        getFinalData = cachedData?.[`${table}`]?.filter((i) => {
                                            let data = i[`${related}`];
                                            if(Array.isArray(related)) {
                                                data = i;
                                                for(let x of related) {
                                                    if(data[`${x}`] !== undefined) {
                                                        data = data[`${x}`];
                                                    }
                                                }
                                            }

                                            if(Array.isArray(data)) {
                                                return data.indexOf(relatedFilter) > -1
                                            }
                                            else {
                                                return data == `${relatedFilter}`
                                            }

                                        });
                                    }
                                    else {
                                        getFinalData = cachedData?.[`${table}`];
                                    }
                                }
                            }
                            else {
                                getFinalData = cachedData?.[`${table}`];
                            }
                        } catch(e) {
                            console.log(e);
                            getFinalData = cachedData?.[`${table}`];
                        }
                    }
                    
                    if(sort == "random" && limit !== undefined) {
                        getFinalData = shuffle(getFinalData).slice(0, limit);
                    }
                    else if(sort == "random" && filter !== undefined && filterOn !== undefined) {
                        getFinalData = shuffle(getFinalData.find((i) => {
                            let data = i[`${filterOn}`];
                            if(Array.isArray(related)) {
                                data = i;
                                for(let x of related) {
                                    if(data[`${x}`] !== undefined) {
                                        data = data[`${x}`];
                                    }
                                }
                            }

                            if(Array.isArray(data)) {
                                return data.indexOf(filter) > -1
                            }
                            else {
                                return data == `${filter}`
                            }
                        })).slice(0, 8);
                    }

                    if(!Array.isArray(getFinalData) && getFinalData !== undefined) {
                        getFinalData = [ getFinalData ];
                    }
                    
                    if(getFinalData !== undefined && sort !== undefined) {
                        let descending = false;
                        if(sort.indexOf('-') > -1) {
                            descending = true;
                            sort = sort.split('-')[1];
                        }
                        if(descending == true) {
                            getFinalData = getFinalData.sort((a,b) => b[`${sort}`] - a[`${sort}`]);
                        }
                        else {
                            getFinalData = getFinalData.sort((a,b) => a[`${sort}`] - b[`${sort}`]);
                        }
                    }
                    if(skip !== undefined && getFinalData !== undefined) {
                        getFinalData = getFinalData.slice(skip, getFinalData.length - 1);
                    }
                    if(limit !== undefined && getFinalData !== undefined) {
                        getFinalData = getFinalData.slice(0, limit);
                    }
                    
                    if(getFinalData == undefined) {
                        getFinalData = [];
                    }
                }

                if(req?.session?.data === undefined) {
                    req.session.data = [];
                }
                req.session.data.push({ id: customId, main: topLevelData, table: table, data: getFinalData, totalDocuments: getFinalData.length, recursive: recursive });
            }
        }
    }


    let parseData = [ ...document.querySelectorAll('data data'), ...document.querySelectorAll('data, config') ];
    for(let item of parseData) {
        let fileOn = item.getAttribute('file-name') || undefined;
        let parseCode = item.getAttribute('parse-code') || undefined;
        let limit = item.getAttribute('limit') || undefined;
        let itemId = item.getAttribute('data-id');
        let allItemData = req.session.data?.find((x) => x.id == itemId);
        let table = allItemData?.table || "no-table";
        if(allItemData?.data?.length == 0) {
            item.classList.add('no-content')
        }
        else {
            item.classList.remove('no-content')
        }
        if(allItemData !== undefined && allItemData.data.length > 0) {
            if(allItemData.data !== undefined && Array.isArray(allItemData.data)) {
                for(let dataItem of allItemData.data) {
                    // Add a qualified URL including the root domain to each data table:
                    if(dataItem.canonicalName !== undefined) {
                        dataItem.qualifiedUrl = `${process.env.rootUrl}${table}/${dataItem.canonicalName}`
                    }
                    if(dataItem.date !== undefined) {
                        dataItem.date = new Date(dataItem.date).toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    }
                    if(dataItem.lastModified !== undefined) {
                        dataItem.lastModified = new Date(dataItem.lastModified).toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    }
                    if(datasetFiles[`${table}`] == true && fileOn !== undefined) {
                        let canonicalName = dataItem[`${fileOn}`];
                        let urlHash = await md5(canonicalName + '-file-cache');
                        let findUrl = await client.get(urlHash);
                        if(findUrl !== null) {
                            dataItem.file = findUrl
                        }
                        else {
                            try {
                                dataItem.file = await fsPromise('./documents/' + canonicalName + '.html', 'utf8');
                            }
                            catch(e) {
                                try {

                                    dataItem.file = await fsPromise('./documents/' + canonicalName + '.md', 'utf8');
                                    dataItem.file = await parseMarkdown(dataItem.file, md);

                                }
                                catch(e) {
                                    // file doesn't seem to exist.. so do nothing
                                    console.log(e);
                                }
                            }
                            if(dataItem.file !== undefined && parseCode == "true") {
                                dataItem.file = await parseFileCode(dataItem.file);

                            }
                            if(dataItem.file !== undefined) {
                                await client.set(urlHash, dataItem.file);
                            }
                        }
                    }
                    try {
                        let checkSeries = allItemData.data?.[0]?.series !== "none" && allItemData.data?.[0]?.series !== undefined && dataItem?.file !== undefined
                        if(dataItem?.file !== undefined || checkSeries) {
                            if(dataItem.file.match(/<div id="nav-init"><\/div>/gmi) !== null) {
                                if(req.session == undefined) {
                                    req.session = {};
                                }
                                if(req.session.meta == undefined) {
                                    req.session.meta = {};
                                }
                                if(req.session?.meta?.classes == undefined) {
                                    req.session.meta.classes = 'nav-enabled'
                                }
                                else {
                                    req.session.meta.classes = `${req.session.meta.classes} nav-enabled`;
                                }
                            }
                        }
                    }
                    catch(e) {
                        console.log(e);
                    }
                }
            }
            let index = 0;
            item.innerHTML = item.innerHTML.replaceAll(/(<data-item>([\S\s]*?)<\/data-item>|<data-header>([\S\s]*?)<\/data-header>)/gmi, function(key) {
                if(key.indexOf('array-loop of="') > -1) {
                    let getOf = [ key.split('array-loop of="')[1].split('"')[0] ];      
                    let thisData = allItemData.data[index];
                    if(getOf[0].indexOf('.') > -1) {
                        getOf = key.split('array-loop of="')[1].split('"')[0].split('.');
                    }
                    for(let x of getOf) {
                        if(thisData?.[`${x}`] !== undefined) {
                            thisData = thisData[`${x}`];
                        }
                    }
                    if(thisData !== undefined && Array.isArray(thisData)) {
                        let finalHTML = '';
                        let index = 0;
                        while(index < thisData.length) {
                            let replacement = {
                                item: thisData[index]
                            }
                            finalHTML += parseDataElements(key.match(/<array-loop(.*?)>([\S\s]*?)<\/array-loop>/gmi)[0], replacement);
                            ++index;
                        }
                        key = key.replace(/<array-loop(.*?)>([\S\s]*?)<\/array-loop>/gmi, finalHTML);
                    }
                }
                if(allItemData?.data?.[index] !== undefined) {
                    let parseData = parseDataElements(key, allItemData.data[index]);
                    parseData = parseData.replace(/<data-item>/g, '').replace(/<\/data-item>/g, '');
                    if(key.match(/<data-header>([\S\s]*?)<\/data-header>/gmi) == null) {
                        ++index;
                    }
                    return parseData;
                } else if(allItemData?.data?.length == 0) {
                    return "";
                }
                else {
                    return "";
                }
            });
            // Finally, if we can't find any more data-items, we move onto data-loops. 
            // These are iterable items that iterate through the remaining 
            // Data items in allItemData.data.
            if(item.innerHTML.match(/<data-loop(.*?)>([\S\s]*?)<\/data-loop>/gmi) !== null) {
                let finalData = '';
                let key = item.innerHTML.match(/<data-loop(.*?)>([\S\s]*?)<\/data-loop>/gmi)[0];
                let sourceData = allItemData.data;
                if(key.indexOf('data-loop of="') > -1) {
                    let getOf = key.split('data-loop of="')[1].split('"')[0];   
                    if(sourceData.length == 1) {
                        sourceData = sourceData?.[0]?.[`${getOf}`];
                    }
                }
                while(index < sourceData?.length) {
                    let thisKey = key;
                    if(key.match(/<data(.*?)>([\S\s]*?)<\/data>/gmi) !== null) {
                        req.session.currentLoopData = sourceData[index];
                        thisKey = await parseDataTables(key, req, true, post, cachedData);
                        thisKey = thisKey.replaceAll(/<data(.*?)>/gmi, '').replaceAll(/<\/data>/gmi, '')
                    }
                    else {
                        delete req.session.currentLoopData;
                    }
                    if(sourceData[index] !== undefined) {
                        finalData += parseDataElements(thisKey.replaceAll(/<data-loop(.*?)>/gmi, '').replaceAll(/<\/data-loop>/gmi, ''), sourceData[index]);
                    }
                    ++index;
                }
                
                delete req.session.currentLoopData;

                item.innerHTML = item.innerHTML.replaceAll(/<data-loop(.*?)>([\S\s]*?)<\/data-loop>/gmi, function() {
                    return finalData;
                });
            }
            if(item.tagName == "CONFIG" || limit == "1" && allItemData.data[0] !== undefined || recursive == true) {
                item.innerHTML = parseDataElements(item.innerHTML, allItemData.data[0], true);
            }
        }
    }
    // Remove any empty elements
    document.querySelectorAll('data.no-content').forEach(function(item) {
        item.remove();
    });
    document.querySelectorAll('[if]').forEach(function(item) {
        let getHtml = item.innerHTML.trim();
        if(getHtml == "") {
            item.remove();
        }
    });

    let finalHtmlContents = document.querySelector('body').innerHTML.replaceAll(/<template>/gmi, '').replaceAll(/<\/template>/gmi, '');
    return finalHtmlContents;
}

// This function will take a set of components and parse it appropriately.
// It iteratively matches through all components in a tree, until no {{component-*}}
// items are left.
const parseComponents = async (componentText, req) => {
    let matchComponents = componentText.matchAll(/{{(.*?)}}/g);
    let componentArray = [];
    let processedFile = componentText;
    for(let component of matchComponents) {
        componentArray.push(component[1]);
    }
    for(let componentId in componentArray) {
        let component = componentArray[componentId];
        if(component !== undefined) {
            // Check if we have a component
            if(component.indexOf('component-') > -1) {
                let componentName = component.split('component-')[1];
                let multipleComponents = false;
                let multipleComponentsMultiplier; 
                if(component.indexOf('*') > -1) {
                    // If there is a * sign, then the component needs to be multiplied out.
                    componentName = componentName.split('*')[0];
                    multipleComponentsMultiplier = parseFloat(component.split('*')[1]);
                    if(!isNaN(multipleComponentsMultiplier)) {
                        multipleComponents = true;
                    }
                }
                // Get the component name
                componentName = `${componentName}.html`;
                // Load the component file
                // Single file load
                let finalFileContent = '';
                let loadFileContent = await loadFile(`./views/components/${componentName}`, `${componentName}`, req);
                // For multiple components, multiply the component by the number given
                if(multipleComponents == true && typeof multipleComponentsMultiplier == "number") {
                    for(let x = 0; x < multipleComponentsMultiplier; ++x) {
                        finalFileContent += loadFileContent;
                    }
                }
                if(finalFileContent == '') {
                    finalFileContent = loadFileContent;
                }
                // Replace the multiply sign so it is escaped
                let createComponentMatch = component.replaceAll("*", "\\*");
                // Replace the component placeholder with the HTML contnet
                let generateRegExp = new RegExp(`{{${createComponentMatch}}}`, "g");
                processedFile = processedFile.replace(generateRegExp, finalFileContent);
                // Check for any more matches
                let matchComponents = processedFile.matchAll(/{{component-(.*?)}}/g);
                for(let component of matchComponents) {
                    if(component[1] !== undefined) {
                        // Recursively replace any more matches
                        processedFile = await parseComponents(processedFile, req);
                    }
                }
            }
        }
    }
    return processedFile;
}

// This takes information gathered from a data table, finds any <data-item> items, 
// and replaces their content with the content of an array passed in data. 
const parseDataElements = (inputText, data, original) => {

    return inputText?.replace(/\{\{(.*?)\}\}/g, function(key) {
        key = key.replace(/[{}]+/g, "");
        let newData;
        let dataClone = data;
        try {

            if(key.indexOf('.') > -1) {
                let keyElements = key.split('.');
                for(let x of keyElements) {
                    let index = key.match(/(?<=\[)[^\]\[\r\n]*(?=\])/g);
                    if(dataClone?.[x] !== undefined) {
                        dataClone = dataClone[x];
                        newData = dataClone;
                    }
                    else if(index !== null) {
                        let getKey = x.replace(/\[(.*?)\]/g, "");
                        let getIndex = parseFloat(index[0]);
                        if(dataClone?.[getKey] !== undefined) {
                            dataClone = dataClone[getKey];
                            newData = dataClone;
                        }
                        if(!isNaN(getIndex) && dataClone?.[getIndex] !== undefined) {
                            dataClone = dataClone[getIndex]
                            newData = dataClone;
                        }
                    }
                }
                if(typeof newData === "object" && Object.keys(newData).length == 0) {
                    if(original == true) {
                        return `{{${key}}}`;
                    }
                    return "";
                }
                else {
                    if(original == true) {
                        return newData ?? `{{${key}}}`;
                    }
                    return newData ?? "";
                }
            }
            if(key.indexOf('[') > -1 &&  key.indexOf(']') > -1) {
                // Different for arrays
                let index = key.match(/(?<=\[)[^\]\[\r\n]*(?=\])/g);
                key = key.replace(/\[(.*?)\]/g, "");
                newData = data[key];
                for(let x in index) {
                    try {
                        index[x] = (!isNaN(parseFloat(index[x]))) ? parseFloat(index[x]) : index[x];
                        if(newData !== undefined && newData[index[x]] !== undefined) {
                            newData = newData[index[x]];
                        }
                    } catch(e) {
                        console.log(e);
                        newData = '';
                    }
                }
            }
            else {
                newData = data?.[key] ?? "";
            }
            if(original == true && newData == "") {
                return `{{${key}}}`;
            }
            return newData ?? "";
        } catch(e) {
            console.log(e);
            return JSON.stringify({"error" : "Could not parse your document.. check your data tables are correctly configured."})
        }
    });
}

// Updates any static held data
const recache = async () => {
    return new Promise(async (resolve) => {
        let returnData = {};
        let recacheData = Object.keys(datasets);
        for(let i of recacheData) {
            let schema = datasets[`${i}`]?.schema?.tree;
            let query = datasets[`${i}`].find();
            if(schema.associatedWith !== undefined) {
                Object.keys(schema.associatedWith).forEach((j) => {
                    if(schema.associatedWith[j].ref !== undefined) {
                        query = query.populate(`associatedWith.${j}`);
                    }
                    else if(schema.associatedWith?.type?.obj !== undefined) {
                        Object.keys(schema.associatedWith.type.obj).forEach((k) => {
                            if(schema.associatedWith.type.obj?.[k]?.ref !== undefined) {
                                query = query.populate(`associatedWith.${k}`);
                            }
                        });
                    }
                });
            }
            Object.keys(schema).forEach((j) => {
                if(schema[j].ref !== undefined || schema[j]?.[0]?.ref !== undefined) {
                    query = query.populate(j);
                }
            });

            let getRedisData = await client.get(`table.${i}`);
            if(getRedisData !== null) {
                returnData[`${i}`] = JSON.parse(getRedisData);
                query.lean().then(async (newData) => {
                    client.set(`table.${i}`, JSON.stringify(newData))
                });
            }
            else {
                returnData[`${i}`] = await query.lean().exec();
                await client.set(`table.${i}`, JSON.stringify(returnData[`${i}`]))
            }        
        }
        resolve(returnData)
    });
}

const createPage = async function(inputFile, req, headless, post) {
    let timerUuid = uuid();

    // This cached in-code store of data loads faster than mongoose queries..
    let cachedData = {}

    // Timer for page creation
    console.time(`pageCreation-${timerUuid}`);
    // Load our page, based on `inputFile` name. It can be .html, or not, we will adjust:
    let fileName = `${inputFile}`
    if(inputFile.split('.').length == 1) {
        fileName = `${inputFile}.html`
    }
    let fileLocation = `./views/pages/${fileName}`;
    if(post == true) {
        fileLocation = `./views/post/${fileName}`
    }
    let loadFileContent = await loadFile(fileLocation, fileName, req)
    let commonFileTemplates = {};


    // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
    // Since we don't want to waste time on loading data directly from the DB, we cache data sources in code.
    // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
    console.time(`recache-${timerUuid}`);
    cachedData = await recache();
    console.timeLog(`recache-${timerUuid}`);
    
    console.time(`config-${timerUuid}`);
    loadFileContent = await removeConfig(`${loadFileContent}`, `${fileName}`, req, cachedData);
    console.timeEnd(`config-${timerUuid}`);

    // We need meta data for a page to load. If the page isn't working, ensure you have a <config> tag in your page with associated JSON.
    if(req?.session?.meta !== undefined || post === true || req?.session?.meta == undefined && headless == true) {

        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
        // The first thing we should do is flesh out all {{component-*}} tags, so we have one source of the truth
        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
        console.time(`parseAllComponents-${timerUuid}`);
        loadFileContent = await parseComponents(loadFileContent, req);
        console.time(`parseAllComponents-${timerUuid}`);

        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
        // Let's load any common files, like ./common/header.html, footer.html, or sidebar.html
        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -

        if(headless === undefined || headless !== true) {
            console.time(`loadCommonFilesTime-${timerUuid}`);
            let commonFiles = await fsDirPromise(`common`);
            let requiredFiles = [ commonFiles.find((x) => x.name == "header.html"), commonFiles.find((x) => x.name == "banner.html"), commonFiles.find((x) => x.name == "footer.html") ];
            if(!requiredFiles.every((x) => x !== undefined)) {
                return JSON.stringify({ "error" : "You need to create three files in ./views/common - header.html, footer.html, and banner.html"})
            }
            for(let item of commonFiles) {
                let name = item.name;
                if(item.name.indexOf('.') > -1) {
                    name = item.name.split('.')[0]
                }
                if(item.isFile == true) {
                    try {
                        commonFileTemplates[name] = await loadFile(`./views/common/${item.name}`, `${item.name}`, req);
                    }
                    catch(e) {
                        console.log(e);
                    }
                }
            }

            console.timeEnd(`loadCommonFilesTime-${timerUuid}`);

            // Our final page looks like this:
            loadFileContent = `
                ${commonFileTemplates.header}
                ${commonFileTemplates.banner}
                ${loadFileContent}
                ${commonFileTemplates.footer}
            `;
        }
        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
        // Sometimes, common file templates are used throughout a page. As such, let's parse any remaining ones we missed.
        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
        if(headless === undefined || headless !== true) {
            console.time(`parseDataElementsTime-${timerUuid}`);
            loadFileContent = await parseDataElements(loadFileContent, commonFileTemplates, true);
            console.timeEnd(`parseDataElementsTime-${timerUuid}`);
        }

        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
        // Let's now find any data elements in the file, which are marked with <data table="table-name" limit?="number"> tags
        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -

        // Replace redis cache here and put it on file upload and API instead.

        console.time(`parseDataTablesTime-${timerUuid}`);
        loadFileContent = await parseDataTables(loadFileContent, req, true, post, cachedData);
        console.timeEnd(`parseDataTablesTime-${timerUuid}`);
        
        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -
        // The last thing we do, so that all CSS and JS is loaded appropriately, 
        // is to take all of our session CSS, and append it to the header
        // Configure default meta information
        // --- - - - --- - - - --- - - - --- - - - --- - - - --- - - - --- - - -

        console.time(`parseRemainingPageMetaTime-${timerUuid}`);
        if(headless === undefined || headless !== true) {
            let additionalStyles = '';
            if(commonFileTemplates.style !== undefined) {
                additionalStyles = commonFileTemplates.style;
            }
            
            let image = `${req.protocol + '://' + req.get('host')}/images/intro-images/default.webp`;
            console.log();
            try {
                let potentialUrl = req.originalUrl.slice(1).split('/')[1];
                let findFile = await fsPromise(`./public/images/intro-images/${potentialUrl}.webp`);
                image = `${req.protocol + '://' + req.get('host')}/images/intro-images/${potentialUrl}.webp`;
            }
            catch(e) {
                //console.log(e);
            }

            let getCss = await consolidateCss(additionalStyles, req)
            let pwa = pwaCache(cachedData);
            let pageMeta = {
                // We'll try to use the values given in page config, if not, we'll use the data given in .env.
                title: req.session.meta.title || process.env.websiteName || "No title!",
                description: req.session.meta.description || process.env.websiteDescription || "No description!",
                robots: req.session.meta.robots || "index,follow",
                year: new Date().getFullYear(),
                canonical: req.protocol + '://' + req.get('host') + req.originalUrl,
                pwaCache: pwa,
                css: getCss.css,
                image: image,
                asyncCss: getCss.asyncCss,
                js: getCss.js,
                classes: req.session.meta.classes || "",
                rootUrl: `${process.env.rootUrl}`,
                csrf: req.session.csrf,
                url: `${process.env.rootUrl}${req.originalUrl.slice(1)}`
            }

            // Our final page looks like this:
            loadFileContent = parseDataElements(loadFileContent, pageMeta);
        }
        
        console.timeEnd(`parseRemainingPageMetaTime-${timerUuid}`);
    }
    else {
        return JSON.stringify({ "error" : "No page metadata. Ensure your page file contains a config" })
    }

    if(headless === undefined || headless !== true) {
        loadFileContent = `<!DOCTYPE html>${loadFileContent}`
    }

    console.timeEnd(`pageCreation-${timerUuid}`);

    return loadFileContent.replaceAll(/<data (.*?)>/gmi, '').replaceAll(/<\/data>/gmi, '').replaceAll(/<data-header(.*?)>/gmi, '').replaceAll(/<\/data-header>/gmi, '');
}

const parseTemplate = async (inputFile, replacement, iterable, req) => {
    replacement = {
        ...replacement,
        year: new Date().getFullYear()
    }
    let allMatches = inputFile.match(/\{\{(.*?)\}\}/g)
    for(let item in allMatches) {
        if(allMatches[item].indexOf('component-') > -1) {
            let key = allMatches[item].replace(/[{}]+/g, "");
            let componentName = key.split('component-')[1];
            if(replacement[componentName] !== undefined && replacement[componentName] !== null) {
                // Component has associated data.
                let getComponent = await loadFile(`./views/components/${componentName}.html`, `${componentName}.html`, req);
                if(getComponent !== '') {
                    // Component File exists
                    let parsedData = await parseTemplate(getComponent, replacement?.[dataStream], iterable, req);
                    replacement[`component-${dataStream}`] = parsedData;
                }
            }
        }
    }
    if(iterable !== undefined && inputFile.match(/\{\{(.*?)\+\}\}/g) !== null) {

        let findMatches = inputFile.match(/\{\{(.*?)\+\}\}/g)
        for(let item in findMatches) {
            try {
                let key = findMatches[item].replace(/[{}]+/g, "");
                key = `${key.split('+')[0]}`;
                let getReplacement = replacement[key];
                let createOutput = '';
                for(let x in getReplacement) {  
                    if(getReplacement[x] !== undefined) {
                        let getIterableFile = await loadFile(`${iterable}/${key.split('*')[0]}.component.html`, `${key.split('*')[0]}.component.html`, req);
                        createOutput += await parseTemplate(getIterableFile, getReplacement[x], iterable, req);
                    }
                }
                
                replacement[`${key}+`] = `${createOutput}`;
                delete replacement[`${key}`];
            }
            catch(e) {
                console.log(e); 
                return "";
            }                
        }
    }


    return inputFile.replace(/\{\{(.*?)\}\}/g, function(key) {
        key = key.replace(/[{}]+/g, "");
        let newData;
        if(key.indexOf('[') > -1 &&  key.indexOf(']') > -1) {
            // Different for arrays
            let index = key.match(/(?<=\[)[^\]\[\r\n]*(?=\])/g);
            key = key.replace(/\[(.*?)\]/g, "");
            newData = replacement[key];
            for(let x in index) {
                try {
                    index[x] = (!isNaN(parseFloat(index[x]))) ? parseFloat(index[x]) : index[x];
                    if(newData !== undefined && newData[index[x]] !== undefined) {
                        newData = newData[index[x]];
                    }
                } catch(e) {
                    console.log(e);
                    newData = '';
                }
            }
        }
        else {
            newData = replacement[key];
        }
        return newData || "";
    });
}

const removeConfig = async function(input, fileName, req, cache) {
    try {
        if(req.session.meta == undefined) {
            req.session.meta = {};
        }

        let removeConfig = input.replaceAll(/(<url(.*?) \/>|<url(.*?)\/>)/gmi, (key) => {
            let urlFormat = key.split('routes="')[1]?.split('"')[0];
            try {
                req.session.meta.url = JSON.parse(urlFormat.replaceAll("'", '"'));
                return "";
            }
            catch(e) {
                console.log(e);
                return JSON.stringify({ "error" : "Your URL configuration is not valid JSON"});
            }
        });

        
        let matchConfig = removeConfig.matchAll(/<config(.*?)>([\S\s]*?)<\/config>/gmi);
        for(let config of matchConfig) {
            let configData = config[0];
            try {
                let checkForData = configData.split('table="')[1]?.split('"')[0];
                // Parse data tables if necessary.
                if(checkForData !== undefined) {
                    configData = await parseDataTables(configData, req, undefined, undefined, cache);
                }
                if(configData.indexOf(':') > -1) {
                    // Parse url stuff
                    configData = configData.replaceAll(/:[a-zA-Z0-9_]*/gmi, (key) => {
                        if(key.split(':') !== undefined) {
                            let getKey = key.split(':')[1];
                            if(req.params[`${getKey}`] !== undefined) {
                                return req.params[`${getKey}`]
                            }
                            else {
                                return key;
                            }
                        }
                    });
                }
                let description = configData.matchAll(/<description>([\S\s]*?)<\/description>/gmi);
                for(let item of description) {
                    req.session.meta.description = item[1];
                }
                let title = configData.matchAll(/<title>([\S\s]*?)<\/title>/gmi);
                for(let item of title) {
                    req.session.meta.title = item[1];
                }
                let classes = configData.matchAll(/<classes>([\S\s]*?)<\/classes>/gmi);
                for(let item of classes) {
                    req.session.meta.classes = item[1];
                }
            }
            catch(e) {
                console.log(e);
                return JSON.stringify({ "error" : "Error parsing page JSON. Check your JSON is in the correct format." })
            }

        }
        removeConfig = removeConfig.replace(/<config(.*?)>([\S\s]*?)<\/config>/gmi, "");

        return removeConfig;
    }
    catch(e) {
        console.log(e);
        return JSON.stringify({ "error" : "Invalid page configuration. This might be because your config JSON is in the wrong format." })
    }
}

const getRoutes = async (page, post) => {
    let routes = [];
    let pageLocation = `./views/pages/${page}`;
    if(post === true) {
        pageLocation = `./views/post/${page}`;
    }
    let openPage = await fsPromise(pageLocation);
    let getUrl = openPage.match(/(<url(.*?) \/>|<url(.*?)\/>)/gmi);
    let headless = getUrl?.[0]?.split('headless="')[1]?.split('"')?.[0] ?? false;
    let cache = getUrl?.[0]?.split('cache="')[1]?.split('"')?.[0] ?? false;
    headless = (headless == "true") ? true : false;
    cache = (cache == "true") ? true : false;
    if(Array.isArray(getUrl)) {
        let urlFormat = getUrl[0]?.split('routes="')[1]?.split('"')?.[0];
        try {
            routes = JSON.parse(urlFormat.replaceAll("'", '"'));
        }
        catch(e) {
            console.log(e);
            return JSON.stringify({ "error" : "Your URL configuration is not valid JSON for"});
        }
    }
    return {
        routes: routes,
        headless: headless,
        cache: cache
    }
}

const removeCss = async function(input, fileName, req) {
    try {
        // Remove any duplicate CSS
        let removeCss = input.replace(/<style combined data-id="(.*?)">([\S\s]*?)<\/style>/gmi, (key) => {
            if(req.session.fileCache[fileName].css == undefined && key !== undefined) {
                req.session.fileCache[fileName].css = key.replace(/<style combined data-id="(.*?)">/gmi, "").replace(/<\/style>/gmi, "");
            }
            return "";
        });

        let removeAsyncCss = removeCss.replace(/<style async data-id="(.*?)">([\S\s]*?)<\/style>/gmi, (key) => {
            if(req.session.fileCache[fileName].asyncCss == undefined && key !== undefined) {
                req.session.fileCache[fileName].asyncCss = key.replace(/<style async data-id="(.*?)">/gmi, "").replace(/<\/style>/gmi, "");
            }
            return "";
        });
        
        return removeAsyncCss;
    }
    catch(e) {
        console.log(e);
        return '';
    }
}

const getRawHtml = async function(input, fileName, req) {
    try {
        // Remove any duplicate CSS
        let removeHtml = input.replace(/<template>([\S\s]*?)<\/template>/gmi, (key) => {
            if(req.session.fileCache[fileName].data == undefined && key !== undefined) {
                req.session.fileCache[fileName].data = key.replace(/<template>/gmi, "").replace(/<\/template>/gmi, "");
            }
            return req.session.fileCache[fileName].data;
        });
        
        return removeHtml;
    }
    catch(e) {
        console.log(e);
        return '';
    }
}

// This function loads component and common files while documenting what CSS they have associated with them.
// That way we can combine it all at the end to produce a single file with compressed CSS.
// It then returns the plain HTML within the <template> tag, and records all CSS and config data in the session.
const loadFile = async (fileLocation, fileName, req) => {
    try {
        if(req.email === true) {
            return await fsPromise(`${fileLocation}`, 'utf8');
        }
        // If the file already exists.. then we just want to return the data we already have.
        if(req.session?.fileCache !== undefined && req.session.fileCache[fileName] !== undefined && req.session.fileCache[fileName].data !== undefined) {
            return `${req.session.fileCache[fileName].data}`;
        }

        // We do this step to make sure each file has a unique style tag, so that we can track it.
        // Nothing too complicated, just adding a data-id to each style tag.
        let loadFile = await fsPromise(`${fileLocation}`, 'utf8');
        loadFile = loadFile.replace(/<style combined>/gmi, `<style combined data-id="${fileName}">`);
        loadFile = loadFile.replace(/<style async>/gmi, `<style async data-id="${fileName}">`);
        
        // If the file name is undefined, then we have to define it.
        if(req.session?.fileCache !== undefined && req.session?.fileCache[fileName] == undefined) {
            req.session.fileCache[fileName] = {}
        }
        // Now we have to process our file. Let's do that now. If it's already processed, we never process twice. We just use the session cache data from before.
        if(req !== undefined && req.session !== undefined && req.session?.fileCache !== undefined && req.session?.fileCache[fileName] !== undefined) {
            // removeCss, removeConfig, and getRawHtml
            loadFile = await removeCss(`${loadFile}`, `${fileName}`, req);
            loadFile = await getRawHtml(`${loadFile}`, `${fileName}`, req);
        }
        return loadFile;
    }
    catch(e) {
        console.log(e);
        return { "error" : "We ran into an error loading your page. Check it is configured properly" }
    }
}

const fsPromise = (fileLocation) => {
    return(new Promise((resolve, reject) => {
        try {
            fs.readFile(`${fileLocation}`, { encoding: 'utf8' }, function (err, data) {
                if(err) {
                    reject(err);
                }
                else {
                    resolve(data);
                }
            })
        }
        catch(e) {
            reject(e);
        }
    }))
}

const fsDirPromise = (dirLocation, inComponents) => {
    return(new Promise((resolve, reject) => {
        try {
            fs.readdir('./views/' + sanatizeFilename(dirLocation), { encoding: 'utf8', withFileTypes: true }, function (err, data) {
                if(err) {
                    console.log(err);
                    reject(err);
                }
                else {
                    let items = [];
                    data.forEach(function(item) {
                        let newItem = { name: `${item}` };
                        if(typeof item.isFile == "function") {
                            newItem.name = item.name;
                            newItem.isFile = item.isFile();
                        }
                        items.push(newItem);
                    })
                    resolve(items);
                }
            })
        }
        catch(e) {
            console.log(e);
            reject(e);
        }
    }))
}

export { loadFile, parseTemplate, fsPromise, fsDirPromise, createPage, getRoutes, parseFileCode, parseMarkdown }