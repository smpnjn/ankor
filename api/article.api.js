// article.api.js
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import { promises as fs } from 'fs'
import nfs from 'fs'
import canvas from '@napi-rs/canvas' // Don't upgrade this the new version is broken
import cwebp from 'cwebp'
import md from 'markdown-it'
import { md5 } from 'hash-wasm'
import sanatizeFilename from 'sanitize-filename'
import { createClient } from 'redis'
import { parseFileCode, parseMarkdown, fsPromise } from '../bin/util.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { createCanvas, GlobalFonts } = canvas;

// create application/json parser
let jsonParser = express.json()
let htmlParser = express.text({ type: 'text/html', limit: '50mb' });


// Redis Connection
const client = createClient();
client.on('error', (err) => console.log('Redis Client Error', err));
await client.connect();


// *.model.js
import { Article } from '../models/article.model.js';
import { Series } from '../models/series.model.js';
import { Category } from '../models/category.model.js';
import { Author } from '../models/author.model.js';

const articleApi = express.Router();

const wrapText = function(ctx, text, x, y, maxWidth, lineHeight) {
    var words = text.split(' ');
    var line = '';
    let testLine = '';
    let wordArray = [];
    let totalLineHeight = 0;
    for(var n = 0; n < words.length; n++) {
        testLine += `${words[n]} `;
        var metrics = ctx.measureText(testLine);
        var testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            wordArray.push([line, x, y]);
            y += lineHeight;
            totalLineHeight += lineHeight;
            line = `${words[n]} `;
            testLine = `${words[n]} `;
        }
        else {
            line += `${words[n]} `;
        }
        if(n === words.length - 1) {
            wordArray.push([line, x, y]);
        }
    }
    return [ wordArray, totalLineHeight ];
}

const generateMainImage = async function(canonicalName, gradientColors, articleName, articleCategory, emoji, version) {
    
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/Inter-ExtraBold.ttf'), 'InterBold');
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/Inter-Medium.ttf'),'InterMedium');
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/Apple-Emoji.ttf'), 'AppleEmoji');
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/JetBrains-Bold.ttf'), 'JetBrains');
    GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/Menlo-Regular.ttf'), 'Menlo');

    // gradientColors is an array [ c1, c2 ]
    
    // Create canvas
    const canvas = createCanvas(1342, 853);
    const ctx = canvas.getContext('2d')

    const capitalize = (str) => {
        let strings = str.split(' ');
        return strings.map(string => string.charAt(0).toLocaleUpperCase()+string.slice(1)).join(' ');
    }

    // Add gradient
    if(version === "1") {
        let grd = ctx.createLinearGradient(0, 853, 1352, 0);
        grd.addColorStop(0, gradientColors[0]);
        grd.addColorStop(0.4, gradientColors[0]);
        grd.addColorStop(1, gradientColors[1]);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, 1342, 853);

        // Write text
        ctx.fillStyle = 'white';
        ctx.font = '95px AppleEmoji';
        ctx.fillText(emoji, 85, 700);

        // More text
        ctx.font = '95px InterBold';
        ctx.fillStyle = 'white';
        let wrappedText = wrapText(ctx, articleName, 85, 753, 1200, 120);
        wrappedText[0].forEach(function(item) {
            ctx.fillText(item[0], item[1], item[2] - wrappedText[1] - (200)); // 200 is height of emoji
        })

        // And more
        ctx.font = '50px InterMedium';
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(capitalize(articleCategory), 85, 553 - wrappedText[1] - 120); // 853 - 200 for emoji, -120 for line height of 1
    }
    else {        
        ctx.fillStyle = `#1d232e`;
        ctx.fillRect(0, 0, 1342, 853);

        // Write text
        ctx.fillStyle = 'white';
        ctx.font = '95px AppleEmoji';
        ctx.fillText(emoji, 85, 700);

        ctx.font = '95px JetBrains';
        ctx.fillStyle = 'white';
        let wrappedText = wrapText(ctx, `   ${articleName}`, 85, 753, 1200, 120);
        let linePosition = 547;
        wrappedText[0].forEach(function(item, index) {
            if(index === 0) linePosition = item[2] - wrappedText[1] - (200);
            ctx.fillText(item[0], item[1], item[2] - wrappedText[1] - (200)); // 200 is height of emoji
        })
        // More text
        ctx.font = '95px Menlo';
        ctx.fillStyle = gradientColors[0];
        ctx.fillText(`❯_`, 85, linePosition - 10); // 200 is height of emoji

    }

    if(nfs.existsSync(path.join(__dirname, '../', `/public/images/intro-images/${sanatizeFilename(canonicalName)}.png`))) {
        return 'Images Exist! We did not create any'
    } 
    else {
        // Set canvas as to png
        try {
            const canvasData = await canvas.encode('png');
            // Save file
            await fs.writeFile(path.join(__dirname, '../', `/public/images/intro-images/${sanatizeFilename(canonicalName)}.png`), canvasData);
        }
        catch(e) {
            console.log(e);
            return 'Could not create png image this time.'
        }
        try {
            const encoder = new cwebp.CWebp(path.join(__dirname, '../', `/public/images/intro-images/${canonicalName}.png`));
            encoder.quality(50);
            await encoder.write(`./public/images/intro-images/${canonicalName}.webp`, function(err) {
                if(err) console.log(err);
            });
        }
        catch(e) {
            console.log(e);
            return 'Could not create webp image this time.'
        }
    
        return 'Images have been successfully created!';
    }
    
}
// Post new article
articleApi.post('/article', jsonParser, async function(req, res) {
    try {
        if(typeof req.body.date == "undefined") {
            req.body.date = Date.now();
        }      
        let requiredKeys = [];
        for(let x of Object.keys(Article.schema.obj)) {
            if(Article.schema.obj[x].required !== false) {
                requiredKeys.push(x);
            }
        }
        
        if(requiredKeys.every(key => Object.keys(req.body).includes(key))) {
            const checkForArticle = await Article.find({ canonicalName: `${req.body.canonicalName}` });
            if(checkForArticle.length > 0) {
                return res.status(200).send({ message: 'An article with that canonicalName already exists! We did not create a new article.'});
            }
            else {
                req.body.associatedWith = {};
                const category = await Category.findOne({ title: `${req.body.category}` });
                if(category !== null) {
                    req.body.associatedWith.category = category._id;
                    const getAuthor = await Author.findOne({ name : `${req.body.author}` });
                    if(req.body.tags !== undefined) {
                        req.body.associatedWith.tags = req.body.tags
                    }
                    if(getAuthor !== null) {
                        req.body.associatedWith.author = getAuthor._id;
                        const newArticle = new Article(req.body);
                        newArticle.save(async function (err, data) {
                            if (err) return res.status(400).send(err);
                            let makeImage = await generateMainImage(`${req.body.canonicalName}`, category.color, `${req.body.titles[0].title}`, category.title, `${req.body.icon}`, "2");
                            return res.status(200).send({ "message" : "Object saved", "imageStatus" : makeImage })
                        });
                        if(req.body.series !== "none" && req.body.series !== false) {
                            const getSeries = Series.findOne({ "canonicalName" : `${req.body.series}` })
                            if(getSeries !== null) {
                                req.body.associatedWith.series = series._id;
                                let currentItems = getSeries.items;
                                Series.findOneAndUpdate({ canonicalName: `${req.body.series}` }, { $push: { items: newSeriesItem }}, { upsert: true }, function(err, doc) {
                                    if(err) return false;
                                });
                            }
                        }
                    }
                    else {
                        return res.status(400).send({ "error" : "Author does not exist. Please create an author first." });
                    }
                }
                else {
                    return res.status(400).send({ "error" : "Category does not exist. Please create it first." });
                }
            }
        } else {
            return res.status(400).send({ "error" : `You are missing a key from your JSON. Check you have them all. You need at least ${JSON.stringify(requiredKeys)}` });
        }
    } catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

// Update article
articleApi.post('/article/update', jsonParser, async function(req, res) {
    try {
        if(req.body.canonicalName !== "undefined") {
            let findArticle = await Article.findOne({"canonicalName" : `${req.body.canonicalName}`});
            if(findArticle !== null) {
                let updateArr = {};
                const articleKeys = Object.keys(Article.schema.obj);
                Object.keys(req.body).forEach(function(item) {
                    try {
                        if(articleKeys.indexOf(item) > -1) {
                            // Valid key
                            if(item === 'titles') {
                                updateArr['titles'] = [];
                                if(Array.isArray(req.body.titles)) {
                                    req.body.titles.forEach(function(item) {
                                        if(item.title !== undefined) {
                                            updateArr['titles'].push({ "title" : `${item.title}` })
                                        }
                                    })
                                }
                            }
                            else if(item == 'tags') {
                                if(Array.isArray(req.body.tags)) {
                                    updateArr['tags'] = [];
                                    req.body.tags.forEach(function(item) {
                                        updateArr['tags'].push(`${item}`);
                                    });
                                }
                            }  
                            else if(item === 'date') {
                                updateArr['date'] = parseInt(req.body.date);
                            }
                            else if(item == 'additionalSeriesData') {
                                updateArr['additionalSeriesData'] = {};
                                updateArra['additionalSeriesData'].icon = `${req.body.additionalSeriesData?.icon}`
                                updateArra['additionalSeriesData'].subArea = `${req.body.additionalSeriesData?.subArea}`
                            }
                            else {
                                updateArr[item] = `${req.body[item]}`
                            }
                        }
                    }
                    catch(e) {
                        console.log(e);
                    }
                });
                Article.findOneAndUpdate({ canonicalName: `${req.body.canonicalName}` }, updateArr, { upsert: true }, function(err, doc) {
                    if(err) return res.status(500).send({ "error" : err });
                    else {
                        res.status(200).send({ "message" : `Article ${req.body.canonicalName} has been updated`});
                    }
                });
            }
            else {
                res.status(400).send({ "message" : "We could not find that article to update"})
            }
        }
        else {
            res.status(200).send({ "message" : "Please ensure you have provided at least canonicalName, and your authentication is correct."});
        }
    } catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

// Create a draft document
articleApi.post('/article/document/:draftName', htmlParser, async function(req, res) {
    try {
        if(typeof req.params.draftName !== "undefined") {  
            let articleExists = await Article.findOne({ 'canonicalName' : `${req.params.draftName}` });
            let updated = false;
            let moreMessage = '';
            if(articleExists !== null) {
                try {
                    if(req.headers.keepOldDate == false || req.headers.keepOldDate == 'false') {
                        await Article.findOneAndUpdate({ canonicalName: `${req.params.draftName}` }, { date: Date.now() }, { upsert: true }, function(err, doc) {
                            if (err) return res.send(500, { "error": err });
                            updated = true;
                        });
                    }
                } catch(e) {        
                    console.log(e);
                    return res.status(400).send({ "error" : "An Error occurred updating the article date. Please try again later" });
                }
            }
            
            let writePath = path.join(__dirname, '../', `/documents/${sanatizeFilename(req.params.draftName)}.html`);
            if(req.headers.md == true || req.headers.md == 'true') {
                writePath = path.join(__dirname, '../', `/documents/${sanatizeFilename(req.params.draftName)}.md`);
            }

            nfs.writeFile(writePath, req.body, 'utf8', async function(err) {
                if(err) {
                    return res.status(400).send({ "error" : err });
                } else {
                    try {
                        let urlHash = await md5(req.params.draftName + '-file-cache');
                        let openFile;
                        try {
                            openFile = await fsPromise('./documents/' + sanatizeFilename(req.params.draftName) + '.html', 'utf8');
                        }
                        catch(e) {
                            try {

                                openFile = await fsPromise('./documents/' + sanatizeFilename(req.params.draftName) + '.md', 'utf8');
                                openFile = await parseMarkdown(openFile, md);

                            }
                            catch(e) {
                                // file doesn't seem to exist.. so do nothing
                                console.log(e);
                            }
                        }
                        if(openFile !== undefined) {
                            openFile = await parseFileCode(openFile);
                            console.log(openFile);
                            await client.set(urlHash, openFile);
                        }
                        if(updated === true) {
                            moreMessage = 'Last updated date has also changed.'
                        }
                        return res.status(200).send({ "success" : `Draft submitted to /draft/${req.params.draftName}.html. ${moreMessage}` });          
                    } catch(e) {
                        console.log(e);
                        return res.status(400).send({ "error" : e });     
                    }
                }
            })

        }
    } catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }
});

// Delete an article
articleApi.post('/article/delete/', jsonParser, async function(req, res) {
    if(typeof req.body.canonicalName !== "undefined") {
        try {
            Article.findOneAndDelete({ canonicalName: `${req.body.canonicalName}` }, function(err, doc) {
                if (err) return res.send(500, { "error": err });
                return res.status(200).send({ "message" : "Article Deleted" })
            });
        } catch(e) {
            console.log(e);
            return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
        }
    } else {
        return res.status(400).send({ "error" : `You are missing a 'canonicalName' from your JSON. Please send JSON in this format: { "canonicalName" : "article-to-delete" }` });
    }
})


export { articleApi }