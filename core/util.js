import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import sanatizeFilename from 'sanitize-filename'
import mongoose from 'mongoose'
import { createClient } from 'redis'
import { readFile } from './files.js'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '../', '.env') });

// Redis Connection
const client = createClient();
client.on('error', (err) => console.log('Redis Client Error', err));
await client.connect();

// Mongoose connection
mongoose.connect(process.env.mongooseUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// This cached in-code store of data loads faster than mongoose queries..
let cache = {}
    
const pwaCache = (cache) => {
    // These are all the pages to cache for the user, so that they can use the latest content in the PWA.
    let cacheContent = [];
    if(cache.article !== null) {
        cacheContent = cache['latestPosts'];
    }
    if(cache.category !== null) {
        let categories = cache.category.map((x) => `/category/${x.canonicalName}`);
        cacheContent = [ ...categories, ...cacheContent ];
    }


    if(cacheContent.length === 0) {
        return JSON.stringify([])
    }
    else {
        return JSON.stringify(cacheContent);
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
            let componentName = key.split('component-')[1];
            if(replacement[componentName] !== undefined && replacement[componentName] !== null) {
                // Component has associated data.
                let getComponent = await readFile(`./views/components/${componentName}.html`, req);
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
                        let getIterableFile = await readFile(`${iterable}/${key.split('*')[0]}.component.html`, req);
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

const fsDirPromise = (dirLocation) => {
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

export { parseTemplate, fsPromise, fsDirPromise }