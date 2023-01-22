import { parseHTML } from 'linkedom'                                         // parseCode, parseDataTag
import { v4 as uuid } from 'uuid'                                            // parseDataTag
import { parent, shuffle} from './core.js'                                   // parseDataTag
import { readFile, readDirectory, fileParser } from './files.js'             // parseDataTag
import { extractConfig, compressCssJs, extractCss } from './extract.js'      // parseDataTag
import { refreshData, getCached } from './data.js'                           // parsePage, parseFile
import path from 'path'                                                      // parseFile
import { md5 } from 'hash-wasm'                                              // parseFile
import sanatizeFilename from 'sanitize-filename'
import schedule from 'node-schedule'

/* Prep global app cache */
globalThis.cache = await refreshData()

/* Keep data up to date frequently */
schedule.scheduleJob('*/5 * * * * *', async function() {
    globalThis.cache = await refreshData()
});

let config = await import('../ankor.config.json', { assert: { type: "json" } }).then((data) => data.default)

/* Replaces <Component /> Tags with actual components. Parses <File /> tags to <file></file> */
const parseNextComponent = async(processedFile, req) => {

    return new Promise(async (resolve) => {
        let component = processedFile.querySelector('component')
        if(component !== undefined) {
            let componentName = component.getAttribute('name')
            if(!componentName) return ""

            let multiplyComponents = component.getAttribute('times')
            if(multiplyComponents) {
                multiplyComponents = parseFloat(multiplyComponents)
            }
            // Get the component name
            componentName = `${componentName}.html`;
            // Load the component file
            let finalFileContent = '';
            let rawComponent = await readFile(`./views/components/${componentName}`, req)

            // For multiple components, multiply the component by the number given
            if(typeof multiplyComponents == "number") {
                for(let multiple = 0; multiple < multiplyComponents; ++multiple) {
                    finalFileContent += rawComponent;
                }
            }
            if(finalFileContent == '') {
                finalFileContent = rawComponent;
            }

            let componentMatchRegex = /<[\s]*[C|c]omponent[\s]*name[\s]*=[\s]*"(.*?)"[\s]*[\/|\s]*>/g
            if(finalFileContent.match(componentMatchRegex) !== null) {
                finalFileContent = finalFileContent.replace(componentMatchRegex, function(key) {
                    return key.replaceAll('Component', 'component') + `</component>`
                })
            }

            // Replace the multiply sign so it is escaped
            // Replace the component placeholder with the HTML contnet
            component.outerHTML = finalFileContent
            // Check for any more matches
            let matchComponents = processedFile.querySelectorAll('component')
            if(matchComponents.length > 0) {
                processedFile = await parseNextComponent(processedFile, req);
            }
            resolve(processedFile)
        }
    })

}

const parseComponents = async (componentText, req, fileName) => {

    return new Promise(async (resolve) => {
        let timerUuid = uuid();
        console.time(`components-${timerUuid}`)

        let fileMatchRegex = /<File[\s]*[name]*[directory]*[extension]*[=]*["']*[\S\s]*?["']*?[\s]*[name]*[directory]*[extension]*[=]*["']*[\S\s]*?["']*?[name]*[directory]*[extension]*[=]*["']*[\S\s]*?["']*?[\s]*[\/]*>/g
        if(componentText && componentText.match(fileMatchRegex) !== null) {
            componentText = componentText.replace(fileMatchRegex, function(key) {
                return key.replaceAll('File', 'file') + `</file>`
            })
        }

        let componentMatchRegex = /<[\s]*[C|c]omponent[\s]*name[\s]*=[\s]*"(.*?)"[\s]*[\/|\s]*>/g
        if(componentText && componentText.match(componentMatchRegex) !== null) {
            componentText = componentText.replace(componentMatchRegex, function(key) {
                return key.replaceAll('Component', 'component') + `</component>`
            })
        }

        let componentDom = parseHTML(`<!DOCTYPE><html><head></head><body>${componentText}</body></html>`).document
        let findComponents = componentDom.querySelectorAll('component')
        if(findComponents.length > 0) {
            componentDom = await parseNextComponent(componentDom, req)
        }
        else if(req?.session?.fileCache[fileName]) {
            req.session.fileCache[fileName].noComponents = true
        }
        console.timeEnd(`components-${timerUuid}`)
        resolve(componentDom)
    })
}

/* Parse <array name="" /> elements */
const parseDataArrays = async (domElement, data, req, table, document) => {
    return new Promise(async (resolve) => {
        let timerUuid = uuid()
        let arrayMatch = domElement.getAttribute('name')
        let arrayHtml = ''
        if(arrayMatch) {
            let arrayItems = data[arrayMatch]
            if(Array.isArray(arrayItems)) {
                for(let element = 0; element < arrayItems.length; ++element) {
                    let thisId = uuid()
                    let dataEl = `<data data-id="${thisId}" data-parsed="true"><data-item data-parsed="true" data-element="${arrayItems[element]._id}">${domElement.innerHTML}</data-item></data>`
                    req.session.dataTags.push(arrayItems[element])
                    req.session.elements.push({ id: thisId, table: table, data: [ arrayItems[element] ], length: 1 })
                    arrayHtml += dataEl
                }
            }
        }
        arrayHtml = arrayHtml.replace(/<data[\s\S]*?>/g, (key) => {
            if(key.indexOf('data-parsed') > -1) {
                return key
            }
            else {
                key = key.replaceAll(/data-id=['"][\s\S]*?['"]/g, `data-id="${uuid()}"`)
                return key
            }
        })
        resolve(arrayHtml)
    })
}

/* Replaces {{}} Tags with actual data */
const parseCurlyTags = async (dataElement, data, original) => {

    return new Promise((resolve) => {
        /* Proceed with replacing rest of curly brackets */
        resolve(dataElement?.replace(/\{\{(.*?)\}\}/g, function(key) {
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
                
                return newData ?? "";
            } catch(e) {
                console.log(e);
                return JSON.stringify({"error" : "Error Parsing this Element"})
            }
        }))
    })
}

/* Parses <data> and <config> tags and associates data */
const parseNextDataTag = async (allDataElements, document, post, req, cache) => {
    
    return new Promise(async (resolve) => {

        // This loop associates data with each data tag
        let item = allDataElements[0]

        // If no items
        if(!item) resolve("")
        else {
            // Generate IDs and Data...
            item.setAttribute('data-id', uuid())

            let thisId = item.getAttribute('data-id')
            // Identify any parents
            let checkParent = parent(item, 'data[data-id]', 2)
            let parentId, dataParentId
            if(checkParent[0]) {
                parentId = checkParent[0].getAttribute('data-id')
                let checkDataParent = parent(item, 'data-loop, data-item', 2)
                if(checkDataParent && checkDataParent[0]) {
                    dataParentId = checkDataParent[0].getAttribute('data-element')
                }
            }

            // Parse for POST requests
            if(post === true && typeof req.body == "object") {
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

            let options = { 'table' : null, 'limit' : null, 'filter' : null, 'parents' : null, 'filter-on' : null, 'sort' : null, 'search' : null, 'search-on' : null, 'skip' : null, 'main' : null, 'test': null };
            let optionKeys = Object.keys(options);
            for(let i of optionKeys) { 
                options[i] = item.getAttribute(i) || undefined;
            }


            if(options['filter'] !== undefined && options['filter'].indexOf(':') > -1) {
                options['filter'] = options['filter'].split(':')[1];
                if(req.params?.[`${options['filter']}`] !== undefined) {
                    options['filter'] = req.params[`${options['filter']}`];
                }
            }
            if(options['search'] !== undefined && options['search'].indexOf(':') > -1) {
                options['search'] = options['search'].split(':')[1];
                if(req.params?.[`${options['search']}`] !== undefined) {
                    options['search'] = req.params[`${options['search']}`];
                }
            }
            if(options['table']) {
                // Retrieve from Redis
                let compileData;

                if(globalThis.cache[options['table']]) {
                    compileData = [ ...globalThis.cache[options['table']] ]
                }
                else {
                    globalThis.cache[options['table']] = await getCached('table', options['table'])
                    compileData = [ ...globalThis.cache[options['table']] ]
                }
                // Parse options correctly
                if(options['limit']) {
                    options['limit'] = !isNaN(parseFloat(options['limit'])) ? parseFloat(options['limit']) : null
                }
                if(options['skip']) {
                    options['skip'] = !isNaN(parseFloat(options['skip'])) ? parseFloat(options['skip']) : null
                }
                
                compileData = compileData.filter((i) => {
                    if(options['search'] && options['search-on']) {
                        let searchArray = options['search'].split(' ');
                        let data = i[`${options['search-on']}`]
                        if(Array.isArray(options['search-on'])) {
                            data = i;
                            for(let x of options['search-on']) {
                                if(data[`${x}`] !== undefined) {
                                    data = data[`${x}`];
                                }
                            }
                        }
                        let checkReturn = true;
                        for(let x of searchArray) {
                            let regexExp = new RegExp(`${sanatizeFilename(x)}`, "gmi");
                            if(data && !data.match(regexExp)) {
                                checkReturn = false;   
                            }
                        }
                        return checkReturn;
                    }
                    else if(options['filter'] && options['filter-on']) {
                        let data = i[`${options['filter-on']}`];
                        if(Array.isArray(data)) {
                            return data.indexOf(options['filter']) > -1
                        }
                        else {
                            return data == options['filter']
                        }
                    }
                    else {
                        return true;
                    }
                });

                if(options['sort'] == "random" && options['sort'] !== undefined) {
                    compileData = shuffle(compileData)
                }
                else if(options['sort'] == "random" && options['filter'] !== undefined && options['filter-on'] !== undefined) {
                    compileData = shuffle(compileData.find((i) => {
                        let data = i[`${options['filter-on']}`];
                        if(Array.isArray(data)) {
                            return data.indexOf(options['filter']) > -1
                        }
                        else {
                            return data == `${options['filter']}`
                        }
                    })).slice(0, 8);
                }

                if(!Array.isArray(compileData) && compileData) {
                    compileData = [ compileData ];
                }

                if(compileData && options['sort']) {
                    let descending = false;
                    if(options['sort'].indexOf('-') > -1) {
                        descending = true;
                        options['sort'] = options['sort'].split('-')[1];
                    }
                    if(descending == true) {
                        compileData = compileData.sort((a,b) => b[`${options['sort']}`] - a[`${options['sort']}`]);
                    }
                    else {
                        compileData = compileData.sort((a,b) => a[`${options['sort']}`] - b[`${options['sort']}`]);
                    }
                }
                if(options['parents'] !== undefined) {
                    if(parentId && dataParentId) {
                        let findParent = req.session.elements.find((x) => x.id === parentId)
                        if(findParent) {
                            let parentData = findParent.data.find((x) => x._id === dataParentId)
                            if(parentData) {
                                let parentsQuery = options['parents'].split(' equals ')
                                let parentAttribute = parentsQuery[0]
                                let childAttribute = parentsQuery[1]

                                if(!parentAttribute || !childAttribute) return
                                
                                parentAttribute = parentData[parentAttribute]

                                if(parentAttribute) {
                                    compileData = compileData.filter((childData) => {
                                        return childData[`${childAttribute}`] === parentAttribute
                                    });
                                }
                            }
                        }
                    }
                }
                else {
                    if(compileData == undefined) {
                        compileData = []
                    }
                }
                
                if(options['skip'] && compileData) {
                    compileData = compileData.slice(options['skip'], compileData.length - 1);
                }
                if(options['limit'] && compileData) {
                    compileData = compileData.slice(0, options['limit']);
                }
                
                req.session.elements.push({ id: thisId, table: options['table'], data: compileData, length: compileData.length, main: options['main'] })

                let copyDocument = `${item.innerHTML}`.replaceAll(/<data [\s\S]*>[\s\S]*<\/data>/g, "")
                let dataItemRegex = /<data-item|<data-loop/g.test(copyDocument)

                if(!dataItemRegex) {
                    item.innerHTML = `<data-item>${document.querySelector(`[data-id="${thisId}"]`).innerHTML}</data-item>`
                }
                let allDataDom = item.querySelectorAll(`data-item, data-loop`)

                let tagNames = []
                for(let i of allDataDom) {
                    let checkParent = parent(i, 'data', 2);
                    if(i.nodeType === 1 && checkParent[0]?.getAttribute('data-id') === thisId) {
                        tagNames.push([ i.tagName, i ])
                    }
                    else if(i.parentElement?.tagName === "CONFIG") {
                        tagNames.push([ i.tagName, i ])
                    }
                }
                
                let dataConfig = { 
                    startDataItems: { number: 0, elements: [] }, 
                    endDataItems: { number: 0, elements: [] }, 
                    dataLoop: { number: 0, elements: [] } 
                }

                for(let countElements of tagNames) {
                    if(countElements[0] === "DATA-ITEM" && dataConfig['dataLoop'] === 0) {
                        ++dataConfig['startDataItems'].number
                        dataConfig['startDataItems'].elements.push(countElements[1])
                    }
                    else if(countElements[0] === "DATA-LOOP") {
                        ++dataConfig['dataLoop'].number
                        dataConfig['dataLoop'].elements.push(countElements[1])
                    }
                    else if(countElements[0] === "DATA-ITEM" && dataConfig['dataLoop'] !== 0) {
                        ++dataConfig['endDataItems'].number
                        dataConfig['endDataItems'].elements.push(countElements[1])
                    }
                }

                let index = 0
                for(let y of Object.keys(dataConfig)) {
                    let nodeHtml = ''
                    if(y === "dataLoop") {
                        let dataLoopHtml = dataConfig[y].elements[0]
                        while(index <= compileData.length) {
                            if(compileData[index] !== undefined && dataLoopHtml) {
                                dataLoopHtml.setAttribute('data-element', compileData[index]._id)
                                dataLoopHtml.setAttribute('data-parsed', true)
                                let dataEl = dataLoopHtml.querySelectorAll('array:not([data-parsed])')
                                if(dataEl[0]) {
                                    let dataElements = parent(dataEl[0], 'data', 2)
                                    let earliestParent
                                    if(dataElements.length > 1) {
                                        earliestParent = dataElements[0].getAttribute('data-id')
                                    }
                                    if(earliestParent === thisId || dataElements.length === 1) {
                                        for(let item of dataEl) {
                                            item.setAttribute('data-parsed', true)
                                            let arrayHtml = await parseDataArrays(item, compileData[index], req, options['table'], document)
                                            item.innerHTML = arrayHtml
                                        } 
                                    }
                                }
                                req.session.dataTags.push(compileData[index])
                                nodeHtml += dataLoopHtml.outerHTML
                            }
                            ++index
                        }
                        if(dataLoopHtml) dataLoopHtml.outerHTML = nodeHtml
                    }
                    else {
                        for(let dataItemHtml of dataConfig[y].elements) {
                            if(compileData[index] !== undefined && dataItemHtml) {
                                dataItemHtml.setAttribute('data-element', compileData[index]._id)
                                dataItemHtml.setAttribute('data-parsed', true)
                                let checkEl = dataItemHtml.querySelectorAll('array:not([data-parsed])')
                                if(checkEl[0]) {
                                    let dataElements = parent(checkEl[0], 'data', 2)
                                    let earliestParent
                                    if(dataElements.length > 1) {
                                        earliestParent = dataElements[0].getAttribute('data-id')
                                    }
                                    if(earliestParent === thisId || dataElements.length === 1) {
                                        for(let item of checkEl) {
                                            item.setAttribute('data-parsed', true)
                                            let arrayHtml = await parseDataArrays(item, compileData[index], req, options['table'], document)
                                            item.innerHTML = arrayHtml
                                        } 
                                    }
                                }
                                req.session.dataTags.push(compileData[index])
                                ++index
                            }
                        }
                    }
                }
            }
            
            item.setAttribute('data-parsed', 'true')
            
            if([ ...document.querySelectorAll('data:not([data-parsed]), config:not([data-parsed])') ].length > 0) {
                await parseNextDataTag([ ...document.querySelectorAll('data:not([data-parsed]), config:not([data-parsed])') ], document, post, req, cache)
            }
            resolve(document)
        }
    })
}

/* Parses <File /> tags */
const parseFile = async (file, directory, extensions, dataSet, req) => {

    return new Promise(async (resolve) => {
        let timerUuid = uuid()
        console.time(`parse-file-${timerUuid}`);

        let fileLocation, mdExt
        if(dataSet[0][`${file}`]) {
            file = dataSet[0][`${file}`]
        }
        else {
            resolve(false)
        }

        let directoryFiles = await readDirectory(directory)
        if(extensions.length == 0) {
            let generateRegex = new RegExp(`${file}`, 'g')
            fileLocation = directoryFiles.find((x) => x.match(generateRegex))
            if(!fileLocation) resolve(false)
        }
        else {
            for(let ext of extensions) {
                let generateRegex = new RegExp(`${file}.${ext}`, 'g')
                fileLocation = directoryFiles.find((x) => x.match(generateRegex))
                if(fileLocation) {
                    if(ext === 'md') mdExt = true
                    break
                }
            }
        }

        try {
            if(!directory || !fileLocation) resolve("")

            let fileDirectoryLocation = path.join(directory, fileLocation)
            let getFile = await getCached('file', await md5(fileDirectoryLocation))

            if(getFile) {
                fileParser(fileDirectoryLocation, mdExt ? 'md' : 'html', true, req)
                console.timeEnd(`parse-file-${timerUuid}`);
                resolve(getFile)
            }
            else {
                let fileContents = await fileParser(fileDirectoryLocation, mdExt ? 'md' : 'html', true, req)
                console.timeEnd(`parse-file-${timerUuid}`);
                resolve(fileContents)
            }
        } catch(e) {
            console.log(e)
            resolve("")
        }
    })
}

/* Initiates parsing of all <data> and <config> tags */
const parseDataTags = async (template, req, post, cache) => {

    return new Promise(async (resolve) => {
        
        let timerUuid = uuid()

        console.time(`parse-data-tags-${timerUuid}`);

        /* Session Data */
        if(!req.session.elements) req.session.elements = []
        if(!req.session.dataTags) req.session.dataTags = []

        const { document } = parseHTML(`<!DOCTYPE html><html><body id="main">${template}</body></html>`)

        await parseNextDataTag([ ...document.querySelectorAll('data:not([data-parsed]), config:not([data-parsed])') ], document, post, req, cache)
        
        let allDataElements = document.querySelectorAll('[data-element]')

        let sortedElements = []
        for(let i = allDataElements.length - 1; i >= 0; --i) {
            sortedElements.push(allDataElements[i])
        }
        
        allDataElements = sortedElements

        if(req.session.dataTags.length > 0) {
            for(let dataItem of allDataElements) {
                if(!dataItem) continue
                let dataId = dataItem.getAttribute('data-element')
                if(dataId) {
                    let dataSet = req.session.dataTags.filter((x) => x._id == dataId)
                    let findCss = req.session.dataTags.filter((x) => x.canonicalName == "css-individual-transform-properties")
                    /* For when a file is associated with the data */
                    if(dataItem.querySelector('file')) {
                        let fileSets = dataItem.querySelectorAll('file')
                        for(let file of fileSets) {
                            let directory = file.getAttribute('directory')
                            let fileDataElement = file.getAttribute('name')
                            let fileDataExtension = file.getAttribute('extension').split('|')
                            if(fileDataElement && directory) {
                                file.outerHTML = await parseFile(fileDataElement, directory, fileDataExtension, dataSet, req)
                            }
                        }
                    }
                    try {
                        dataItem.outerHTML = await parseCurlyTags(dataItem.outerHTML, dataSet[0])
                    }
                    catch(e) {
                        console.log(e)
                    }
                }

            }
        }

        let remainingEmptyElements = document.querySelectorAll('data-item:not([data-element]), data-loop:not([data-element]), [a-if]')
        
        for(let item of remainingEmptyElements) {
            if(item.hasAttribute('a-if')) {
                let contents = item.innerHTML.trim()
                if(item.matches(':empty') || contents == "") {
                    item.remove()
                }
            }
            else if(item.parentElement.tagName !== "CONFIG") {
                item.remove()
            }
        }

        /* Extract <config /> */
        let getConfig = document.querySelector('config')
        if(getConfig) {
            extractConfig(getConfig, req)
            getConfig.remove()
        }

        console.timeEnd(`parse-data-tags-${timerUuid}`);

        resolve(document.body.innerHTML.replaceAll(/<[\s]*data[\s\S]*?>|<[\s]*array[\s\S]*?>|<\/array>|<\/data[\s\S]*?>/g, ""))
    })
}

/* Create <head> and footer for non-headless pages */
const parseHeaderFooter = async(rawPage, req) => {

    return new Promise(async (resolve) => {
        
        let timerUuid = uuid()

        console.time(`parse-header-footer-${timerUuid}`)
        let headerFile = await readFile(`./views/common/header.html`, req) || ""
        let footerFile = await readFile(`./views/common/footer.html`, req) || ""
        
        if(headerFile) {
            rawPage = headerFile + rawPage
            await extractCss(headerFile, 'header.html', req)
        }
        else {
            rawPage = `<!DOCTYPE HTML><html><head></head><body>` + rawPage
        }

        if(footerFile) {
            rawPage = rawPage + footerFile
            await extractCss(footerFile, 'footer.html', req)
        }
        else {
            rawPage = rawPage + `</body></html>`
        }

        /* Parse Css into single output */
        let rawCssJs = await compressCssJs(req)

        /* Initiate new document */
        const { document } = parseHTML(rawPage)
        console.timeEnd(`parse-header-footer-${timerUuid}`)
        
        let css = `<style id="_c" type="text/css">${rawCssJs.css}</style><style id="_a" media="print" type="text/css">${rawCssJs.asyncCss}</style><script defer>window.addEventListener('load', () => { document.getElementById('_a').setAttribute('media', 'all'); })</script>`
        document.head.innerHTML = document.head.innerHTML + css
        
        let js = `<script async>${rawCssJs.js}</script>`
        document.body.innerHTML = document.body.innerHTML + js

        let potentialUrl = req.originalUrl.slice(1).split('/')[1];
        let image = `${req.protocol + '://' + req.get('host')}/images/intro-images/${potentialUrl}.webp`;

        let images = `<meta name="twitter:image" content="${image}"><meta property="og:image" content="${image}" />`

        document.head.innerHTML = document.head.innerHTML + images

        /* CSRF Config */
        if(req.session.csrf) {
            let csrf = `<meta name="csrf-token" content="${req.session.csrf}">`
            document.head.innerHTML = document.head.innerHTML + csrf
        }


        /* Canonical Config */
        let canonical = req.protocol + '://' + req.get('host') + req.originalUrl
        let canonicals = `<link rel="canonical" href="${canonical}"><meta property="og:url" content="${canonical}" />`
        document.head.innerHTML = document.head.innerHTML + canonicals

        if(req.session.meta) {
            /* Title config */
            if(req.session.meta.title) {
                let titles = `<meta property="og:title" content="${req.session.meta.title}"><meta name="twitter:title" content="${req.session.meta.title}"><title>${req.session.meta.title}</title>`
                document.head.innerHTML = document.head.innerHTML + titles
            }
            else if(config.websiteName) {
                let titles = `<meta property="og:title" content="Ankor"><meta name="twitter:title" content="Ankor"><title>${config.websiteName}</title>`
                document.head.innerHTML = document.head.innerHTML + titles
            }
            else {
                let titles = `<meta property="og:title" content="Ankor"><meta name="twitter:title" content="Ankor"><title>Ankor</title>`
                document.head.innerHTML = document.head.innerHTML + titles
            }

            /* Robots config */
            let robots
            if(req.session.meta.robots) {
                robots = `<meta name="robots" content="max-image-preview:large,${req.session.meta.robots}">`
            }
            else {
                robots = `<meta name="robots" content="max-image-preview:large,index,follow">`
            }
            document.head.innerHTML = document.head.innerHTML + robots
            
            /* Description config */
            if(req.session.meta.description) {
                let descriptions = `<meta property="og:description" content="${req.session.meta.description}" /><meta name="twitter:description" content="${req.session.meta.description}"><meta name="description" content="${req.session.meta.description}">`
                document.head.innerHTML = document.head.innerHTML + descriptions
            }
            if(req.session.meta.classes) {
                let classes = req.session.meta.classes.split(' ')
                for(let singleClass of classes) {
                    document.body.classList.add(singleClass)
                }
            }
        }

        resolve(document.documentElement.outerHTML)

    })

}

/* Initiates all parsing */
const parsePage = async function(page, req, headless, post) {

    let timerUuid = uuid()
    console.time(`parse-full-page-${timerUuid}`)

    return new Promise(async (resolve) => {
        /* Refresh data mongodb --> redis */
        refreshData().then((data) => {
            globalThis.cache = data
        })

        if(!post && req.session) {
            req.session.elements = []
        }

        let fileName = `${page.split('.')[0]}.html`
        let fileLocation = `./views/${post ? 'post' : 'pages'}/${fileName}`
        let rawPage = await readFile(`${fileLocation}`, req)

        /* Parse <Component /> Tags */
        rawPage = await parseComponents(rawPage, req, fileName)

        /* Parse any <data> or <config> tags which emerge from header.html or footer.html */
        rawPage = await parseDataTags(rawPage, req, post, globalThis.cache)

        /* Parse header */
        if(!headless) {
            rawPage = await parseHeaderFooter(rawPage, req)
            rawPage = await parseDataTags(rawPage, req, post, globalThis.cache)
        }

        if(req.session) req.session.headersSent = true

        if(req && req.session && req.session.elements) {
            let mainEl = req.session.elements.filter((x) => x.main == "true" || x.main == true)
            if(mainEl && mainEl.length > 0 && mainEl[0].data && mainEl[0].data.length == 0) {
                if(req.session) req.session.noData = true
                resolve({ next: true })
            }
        }
        
        console.timeEnd(`parse-full-page-${timerUuid}`)
        console.log('|---------------------------------------------------------------------|')
        resolve(rawPage)
    })
}

export { parseDataTags, parseComponents, parsePage } 