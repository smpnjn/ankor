import { fileURLToPath } from 'url'
import path from 'path'
import bcrypt from 'bcrypt'
import CleanCSS from 'clean-css'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import sanatizeFilename from 'sanitize-filename';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cleanCss = new CleanCSS({});

import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '.env') });

// *.view.js
import { categoryStructure } from './views/category.view.js'
import { seriesStructure } from './views/series.view.js'

// Models
import { User } from './models/user.model.js';
import { Article } from './models/article.model.js';
import { Category } from './models/category.model.js';
import { Role } from './models/role.model.js'

// This handles all basic authentication for API endpoints
const basicAuth = async function(req, accessLevel) {
    return new Promise(async (resolve) => {
        if(accessLevel === 0) {
            resolve(true);
        }
        else if(req.headers.username !== "undefined") {
            const getUser = await User.findOne({ "username" : req.headers.username });
            if(getUser !== null) {
                if(Object.keys(getUser).length > 0) {
                    bcrypt.compare(req.headers.password, getUser.password, async function(err, result) {
                        if(result) {
                            // Valid password
                            if(req.headers.apikey !== "undefined" && req.headers.apikey == getUser.apiKey) {
                                // Valid apiKey
                                if(!getUser.apiEnabled) {
                                    resolve(false);
                                }
                                else if(accessLevel === undefined) {
                                    resolve(true);
                                }
                                else {
                                    let checkRole = await Role.findOne({ role: getUser.role });
                                    if(checkRole === null) {
                                        resolve(true);
                                    }
                                    else {
                                        if(checkRole.importance >= accessLevel || accessLevel == 0) {
                                            resolve(true)
                                        }
                                        else {
                                            resolve(false);
                                        }
                                    }
                                }
                            } else {
                                resolve(false);
                            }
                        } else {
                            resolve(false);
                        }
                    });
                } else {
                    resolve(false);
                }
            } else {
                resolve(false);
            }
        }
        else {
            resolve(false);
        }
    });
}

// This handles all JWT authentication for API endpoints
const jwtAuth = async function(req) {
    return new Promise(async (resolve) => {
        if(accessLevel === 0) {
            resolve(true);
        }
        else if(req.headers.token === undefined) {
            resolve(false);
        }
        else {
            let secret = await fsPromise('./certificates/jwt.key', 'utf8');
            try {
                let decodedToken = jwt.verify(req.headers.token, secret, { algorithms: ['RS512'] } );
                if(decodedToken.data.username !== undefined) {
                    let getUser = await User.findOne({ "username": decodedToken.data.username });
                    let checkRole = await Role.findOne({ role: getUser.role });
                    if(checkRole === null) {
                        resolve(true);
                    }
                    else if(decodedToken.data.apiKey !== undefined && decodedToken.data.apiKey === getUser.apiKey) {
                        if(checkRole.importance >= accessLevel || accessLevel == 0) {
                            resolve(true);
                        }
                        else {
                            resolve(false);
                        }
                    }
                    else {
                        resolve(false);
                    }
                }
                else {
                    resolve(false);
                }
                resolve(true);
            } catch(e) {
                console.log(e);
                resolve(false);
            }
        }
    })
}

const apiVerification = async function(req, accessLevel) {
    return new Promise(async (resolve, reject) => {
        const getUsers = await User.find();
        const userCount = getUsers.length;
        if(userCount == 0) {
            resolve(true);
        } 
        if(req.originalUrl === '/api/token' || req.originalUrl === '/api/token/') {
            try {
                let checkAuth = await basicAuth(req, accessLevel);
                resolve(checkAuth);
            }
            catch(e) {
                console.log(e);
            }
        }
        else {
            // All other routes must conform to the process.env variable
            if(process.env.authorization === undefined || process.env.authorization === "basic") {
                try {
                    let checkAuth = await basicAuth(req, accessLevel);
                    resolve(checkAuth);
                }
                catch(e) {
                    console.log(e);
                }
            }  
            else if(process.env.authorization === "jwt") {
                try {
                    let checkAuth = await jwtAuth(req);
                    resolve(checkAuth);
                }
                catch(e) {
                    console.log(e);
                }
            }
        }
    });
}

const createPage = async function(inputFile, ...args) {
    try {
        let replacement, data, generic, req;
        if(args.length === 4) {
            replacement = args[0];
            data = args[1];
            generic = args[2];
            req = args[3];
        }
        else if(args.length === 3) {
            replacement = args[0];
            generic = args[1];
            req = args[2]
        }
        else if(args.length === 2) {
            replacement = args[0];
            generic = args[0];
            req = args[1];
        }

        if(data !== undefined && data !== null) {
            // By default, data element key names override key names in "replacement"
            // If duplicates occur
            Object.keys(replacement).forEach(function(item) {
                if(Object.keys(data).indexOf(item) > -1) {
                    delete replacement[item];
                }
            })
        }
        
        inputFile = inputFile.split('.');
        replacement = {
            ...await fetchComponents(inputFile, data || {}, req),
            ...replacement
        }

        let directory = `./outputs/components/${inputFile[0]}`;
        inputFile = await loadFile(`./outputs/${inputFile[1]}/${inputFile.join('.')}`, `${inputFile[0]}`, req);

        // This is for adding in generic files found in the ./outputs/components/* base directory.
        // All files in this folder are added onto every "createPage" string
        let commonJs = '';
        try {
            commonJs = await fsPromise('./common.js');
        }
        catch(e) {
            console.log('No common.js file found.')
        }
        let genericTemplateTags = {
            categories: await categoryStructure.allCategories(),
            series: await seriesStructure.allSeries(),
            year: new Date().getFullYear(),
            image: process.env.rootUrl + '/images/intro-images/default.webp',
            robots: 'index,follow',
            commonJs:  commonJs
        }
        if(typeof generic === "object") {
            genericTemplateTags = {
                ...generic,
                ...genericTemplateTags
            }
        }
        try {
            let getCanonical = req.originalUrl.split('/')[req.originalUrl.split('/').length - 1];
            await fsPromise(`./public/images/intro-images/${getCanonical}.png`)
            genericTemplateTags.image = `${process.env.rootUrl}/images/intro-images/${getCanonical}.png`;
        }
        catch(e) {
            try {
                let getCanonical = req.originalUrl.split('/')[req.originalUrl.split('/').length - 1];
                await fsPromise(`./public/images/intro-images/${getCanonical}.webp`)
                genericTemplateTags.image = `${process.env.rootUrl}/images/intro-images/${getCanonical}.webp`;
            }
            catch(e) {
                // No image..
                //console.log(e);
            }
        }
        let genericTemplates = await fsDirPromise(`generic`, true);
        let filterGenerics = genericTemplates.filter(item => item.isFile());
        for(let key in filterGenerics) {
            let fileNamespace = filterGenerics[key].name.split('.generic')[0];
            if(fileNamespace == "header") {
                continue;
            }
            if(fileNamespace == "style") {
                replacement['style'] = await fsPromise(`./outputs/generic/${filterGenerics[key].name}`, 'utf8');
                continue;
            }
            try {
                replacement[`${fileNamespace}`] = await loadFile(`./outputs/generic/${filterGenerics[key].name}`, `${filterGenerics[key].name}`, req);
                replacement[`${fileNamespace}`] = await parseTemplate(replacement[fileNamespace], genericTemplateTags, `./outputs/generic`, req);
            }
            catch(e) {
                console.log(e);
            }
        }
        try {
            let css, compressCss;
            let asyncCss, compressAsyncCss;
            try {
                css = await fsPromise('./common.css') || "";
                asyncCss = await fsPromise('./async.css') || "";
            } 
            catch(e) {
                css = '';
                asyncCss = '';
            }
            if(replacement['style'] !== undefined) {
                css += replacement['style'];
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
                    console.log('Issue compressing CSS');
                }
            }
            
            let cachePosts = [];
            let cacheCategories = [];
            let getLatestPages = await Article.find().sort('-date').limit(20);
            let getAllCategories = await Category.find().sort('-date').limit(20);
            if(getLatestPages !== null) {
                cachePosts = getLatestPages.map((x) => `/article/${x.canonicalName}`);
            }
            if(getAllCategories !== null) {
                cacheCategories = getAllCategories.map((x) => `/category/${x.title}`);
            }
            let finalCache = [ ...cachePosts, ...cacheCategories ];
            genericTemplateTags = { 
                ...genericTemplateTags,
                commonCss: compressCss,
                asyncCss: compressAsyncCss,
                cachePosts: JSON.stringify(finalCache),
                rootUrl: `${process.env.rootUrl}`,
                url: `${process.env.rootUrl}${req.originalUrl.slice(1)}`
            }
            replacement['header'] = await loadFile(`./outputs/generic/header.generic.html`, `header.generic.html`, req);
            replacement['header'] = await parseTemplate(replacement['header'], genericTemplateTags, './outputs/generic', req);
        }
        catch(e) {
            console.log('Please create a ./outputs/generic/header.generic.html file.', e)
        }

        // Return the templated html
        return await parseTemplate(inputFile, replacement, directory, req);

    }
    catch(e) {
        console.log(e);
        return '';
    }
}

const fetchComponents = async (inputFile, data, req) => { 
    if(inputFile[0] === '404') {
        return {};
    }
    if(inputFile[0] !== undefined && inputFile[1] !== undefined) {
        try {
            let directory = await fsDirPromise(`${inputFile[0]}`, false);
            req.componentDirectory = inputFile[0];
            let additionalComponents = {};
            for(let file in directory) {
                let fileName = directory[file].split('.component.html')[0];
                if(data !== undefined && data[fileName] !== undefined && data[fileName] !== null && data[fileName] || data[inputFile[0]] !== undefined && data[inputFile[0]] !== null) {
                    let getFile = await loadFile(`./outputs/components/${inputFile[0]}/${directory[file]}`, `${directory[file]}`, req);
                    additionalComponents[fileName] = await parseTemplate(getFile, data[fileName], `./outputs/components/${inputFile[0]}`, req);
                }
                else if(data[fileName] == null) {
                    additionalComponents[fileName] = "";
                }
                else {                        
                    additionalComponents[fileName] = await loadFile(`./outputs/components/${inputFile[0]}/${directory[file]}`, `${directory[file]}`, req)
                }
            }
            return additionalComponents;
        }
        catch(e) {
            //console.log(`${inputFile[0]} page has no associated components`);
            return {}
        }
    }
    else {
        return {}
    }
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
            let dataStream = key.split('component-')[1];
            if(replacement[dataStream] !== undefined && replacement[dataStream] !== null) {
                // Component has associated data.
                let getComponent = await loadFile(`${iterable}/${dataStream}.component.html`, `${dataStream}.component.html`, req);
                if(getComponent !== '') {
                    // Component File exists
                    let parsedData = await parseTemplate(getComponent, replacement[dataStream], iterable, req);
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
                
                replacement[`${key}+`] = createOutput;
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

const removeCss = async function(input, fileName, req) {
    try {
        // Remove any duplicate CSS
        let removeCss = input.replace(/<style combined data-id="(.*?)">([\S\s]*?)<\/style>/gmi, (key) => {
            if(req.session.fileCache[fileName].css == undefined && key !== undefined) {
                req.session.fileCache[fileName].css = key.replace(/<style combined data-id="(.*?)">/gmi, "").replace(/<\/style>/gmi, "");
            }
            return "";
        });

        let removeAllCss = removeCss.replace(/<style async data-id="(.*?)">([\S\s]*?)<\/style>/gmi, (key) => {
            if(req.session.fileCache[fileName].asyncCss == undefined && key !== undefined) {
                req.session.fileCache[fileName].asyncCss = key.replace(/<style async data-id="(.*?)">/gmi, "").replace(/<\/style>/gmi, "");
            }
            return "";
        });

        return removeAllCss;
    }
    catch(e) {
        console.log(e);
        return '';
    }
}

const loadFile = async (fileLocation, fileName, req) => {
    try {
        if(req.email === true) {
            return await fsPromise(fileLocation, 'utf8');
        }
        if(req.session.fileCache !== undefined && req.session.fileCache[fileName] !== undefined && req.session.fileCache[fileName].data !== undefined) {
            return req.session.fileCache[fileName].data;
        }
        let loadFile = await fsPromise(fileLocation, 'utf8');
        loadFile = loadFile.replace(/<style combined>/gmi, `<style combined data-id="${fileName}">`);
        loadFile = loadFile.replace(/<style async>/gmi, `<style async data-id="${fileName}">`);
        
        if(req.session.fileCache !== undefined && req.session.fileCache[fileName] == undefined) {
            req.session.fileCache[fileName] = {}
        }
        if(req !== undefined && req.session !== undefined && req.session.fileCache !== undefined && req.session.fileCache[fileName] !== undefined) {
            loadFile = await removeCss(loadFile, fileName, req);
            req.session.fileCache[fileName].data = loadFile;

        }
        return loadFile;
    }
    catch(e) {
        console.log(e);
        return '';
    }
}

const fsPromise = (fileLocation) => {
    return(new Promise((resolve, reject) => {
        try {
            fs.readFile(fileLocation, { encoding: 'utf8' }, function (err, data) {
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

const fsDirPromise = (dirLocation, withFileTypes) => {
    return(new Promise((resolve, reject) => {
        try {
            fs.readdir('./outputs/' + sanatizeFilename(dirLocation), { encoding: 'utf8', withFileTypes: withFileTypes }, function (err, data) {
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

export { loadFile, basicAuth, parseTemplate, createPage, apiVerification, fsPromise, fsDirPromise }