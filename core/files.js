import { parseHTML } from 'linkedom'                                    // fileCode
import { rehype } from 'rehype'                                         // fileCode
import rehypePrism from 'rehype-prism-plus'                             // fileCode
import md from 'markdown-it'                                            // prepareMarkdown
import { md5 } from 'hash-wasm'         
import { v4 as uuid } from 'uuid'
import fs from 'fs'
import { setCached } from './data.js'
import { extractCss, extractHtml } from './extract.js'

globalThis.fileTimeCache = {}

/* parses code */
const fileCode = async (file) => {
    const { document } = parseHTML(`<!DOCTYPE html><html><body id="main">${file}</body></html>`);
    let getCode = document.querySelectorAll('pre code')
    if(getCode[0]) {
        for(let item of getCode) {
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
                    let getCode = merge.document.querySelector('code').children[0]
                    if(getCode.textContent.trim() == '') {
                        getCode.remove();
                        for(let item of merge.document.querySelectorAll('code > span')) {
                            item.setAttribute('line', parseFloat(item.getAttribute('line')) - 1);
                        }
                    }
                    item.parentNode.prepend(newEl);
                    item.innerHTML = merge.document.querySelector('code').innerHTML;
                }
                catch(e) {
                    console.log(e);
                }
            }
        }
    }

    return document.body.innerHTML
}

/* parses markdown - contains some custom rules */
const prepareMarkdown = () => {
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

    return markdownIt

}

/* Loop in custom markdown rules */
const fileMarkdown = prepareMarkdown()

/**
 * reads a file using loadFile, and caches it
 * @param {string} fileLocation - This is the path to the file you want to load
 * @param {string} fileName - This is the name of the file (unique identifier preferred)
 * @param {object} req - This is an express.js request object
 */
let syncFile = async (fileLocation, fileName, req) => {

    return new Promise(async (resolve) => {

        if(req && req.session?.fileCache && req.session?.fileCache[fileName] && req.session?.fileCache[fileName].data) {
            console.log(req.session?.fileCache[fileName])
            resolve(req.session?.fileCache[fileName].data)
        }
        else {
            let getLoadedFile = await loadFile(`${fileLocation}`, fileName)
            let fileContents = getLoadedFile.data


            /* Return nothing if file doesn't exist */
            if(!fileContents) resolve("")

            if(req && req.session?.fileCache !== undefined && req.session?.fileCache[fileName] == undefined) {
                req.session.fileCache[fileName] = {}
            }

            if(req && req.session?.fileCache && req.session?.fileCache[fileName] && getLoadedFile && getLoadedFile.cached) {
                req.session.fileCache[fileName].cachedCss = getLoadedFile.cached
            }
            
            /* Process our file */
            if(req && req.session !== undefined && req.session?.fileCache !== undefined && req.session?.fileCache[fileName] !== undefined && req.session.fileCache[fileName].data == undefined) {
                fileContents = await extractCss(`${fileContents}`, `${fileName}`, req)
                fileContents = await extractHtml(`${fileContents}`, `${fileName}`, req)
            }
            else {
                fileContents = await extractCss(`${fileContents}`, `${fileName}`)
                fileContents = await extractHtml(`${fileContents}`, `${fileName}`)
            }

            if(req && req.session && req.session.fileCache && req.session.fileCache[fileName] !== undefined && req.session.fileCache[fileName].data == undefined) {
                req.session.fileCache[fileName].data = fileContents
            }
            
            resolve(fileContents)
        }
    })
}

const fileLoadTime = (fileLocation) => {
    return new Promise((resolve) => {
        try {
            let statSync = fs.statSync(`${fileLocation}`)
            resolve(statSync)
        }
        catch(e) {
            resolve(false)
        }
    })
}
/**
 * loads a file using built in fs functions
 * @param {string} fileLocation - This is the path to the file you want to load
 */
const loadFile = async (fileLocation, fileName) => {
    
    return(new Promise(async (resolve, reject) => {

        let fileTime = await fileLoadTime(`${fileLocation}`)
        let cached = false;

        if(!globalThis.fileTimeCache[fileName]) globalThis.fileTimeCache[fileName] = {}

        if(fileTime.mtimeMs) {
            let checkTime = globalThis.fileTimeCache[fileName].time
            if(`${checkTime}` == `${fileTime.mtimeMs}`) {
                cached = true
            }
            else {
                globalThis.fileTimeCache[fileName].time = fileTime.mtimeMs
            }
        }

        try {
            let fileContents = fs.readFileSync(`${fileLocation}`, 'utf-8')
            resolve({ data: fileContents, timestamp: fileTime.mtimeMs, cached: cached })
        }
        catch(e) {
            resolve({ data: "", timestamp: 0, cached: true });
        }
    }))
}

/**
 * reads a file using loadFile, and caches it
 * @param {string} fileLocation - This is the path to the file you want to load
 * @param {object} req - This is an express.js request object
 */
let readFile = async (fileLocation, req) => {
    return new Promise(async (resolve) => {
        try {
            let fileName;
            if(fileLocation.indexOf('/') > -1) {
                fileName = fileLocation.split('/')
                fileName = fileName[fileName.length - 1]
            }
            else {
                fileName = fileLocation
            }

            if(req && req.fileName == '404.html') {
                return;
            }
            
            // If the file already exists.. then we just want to return the data we already have.
            if(req && req.session?.fileCache !== undefined && req.session.fileCache[fileName] !== undefined && req.session.fileCache[fileName].data !== undefined) {
                syncFile(`${fileLocation}`, fileName, req)
                resolve(`${req.session.fileCache[fileName].data}`)
            }

            let syncFileSync = await syncFile(`${fileLocation}`, fileName, req)
            resolve(syncFileSync)
        }
        catch(e) {
            console.log(e)
            resolve(false)
        }
    })
}


/**
 * reads a file using loadFile, and caches it
 * @param {object} data - The data to be loaded into the file location
 * @param {string} fileLocation - The file location to save the file (including file name)
 * @param {string} fileType - The file type - must be .md or .html
 * @param {boolean} parseCode - Whether to parse code or not
 */
let writeFile = async (data, fileLocation, fileType, parseCode) => {
    try {
        return(new Promise(async (resolve) => {
            let fileContents = data
            if(fileType === 'md') {
                fileContents = fileMarkdown.render(fileContents)
            }
            if(fileContents && parseCode) {
                fileContents = fileCode(fileContents)
            }
            fs.writeFile(fileLocation, data, 'utf8', async function(err) {
                if(err) {
                    resolve({ "success" : false, "error" : err })
                } else {
                    try {
                        await setCached('file', await md5(fileLocation), fileContents)
                        resolve({ "success" : true, "message" : `Draft submitted to as ${fileLocation}` })
                    } catch(e) {
                        console.log(e)
                        resolve(false)
                    }
                }
            })
        }))
    }
    catch(e) {
        console.log(e)
        return false
    }
}

const fileSyncer = async(data, fileLocation) => {
    setCached('file', await md5(fileLocation), data)
}

const fileParser = async (fileLocation, fileType, parseCode, req) => {
    return new Promise(async (resolve) => {
        let fileContents = await readFile(`${fileLocation}`, req)
        if(fileType === 'md') {
            fileContents = fileMarkdown.render(fileContents)
        }
        if(fileContents && parseCode) {
            fileContents = fileCode(fileContents)
        }
        fileSyncer(fileContents, fileLocation)
        resolve(fileContents)
    })
}
/**
 * reads all files in a directory
 * @param {string} dirLocation - This is the path to the file you want to load
 */
let readDirectory = async (dirLocation) => {
    return(new Promise((resolve, reject) => {
        fs.readdir(dirLocation,  { encoding: 'utf8' }, function (err, data) {
            if(err) resolve(false)
            resolve(data)
        })
    }))
}


export { readFile, readDirectory, writeFile, fileMarkdown, fileCode, fileParser } 