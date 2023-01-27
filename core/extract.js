import { readFile } from './files.js'                 // extractRoutes
import { parseHTML } from 'linkedom'                  // extractRoutes
import CleanCSS from 'clean-css'                      // extractCssJs
import { v4 as uuid } from 'uuid'
import { md5 } from 'hash-wasm'
import { setCached, getCached } from './data.js'

/* Initialize CleanCSS */
const compressCss = new CleanCSS({});

const extractCss = async function(input, fileName, req) {
    return new Promise((resolve) => {
        try {
            // Remove any duplicate CSS
            let removeCss = input.replace(/<style combined>([\S\s]*?)<\/style>/gmi, (key) => {
                if(req && req.session?.fileCache && req.session.fileCache[fileName] && req.session.fileCache[fileName].css == undefined && key !== undefined) {
                    req.session.fileCache[fileName].css = key.replace(/<style combined>/gmi, "").replace(/<\/style>/gmi, "")
                }
                return "";
            });

            let removeAsyncCss = removeCss.replace(/<style async>([\S\s]*?)<\/style>/gmi, (key) => {
                if(req && req.session?.fileCache && req.session.fileCache[fileName] && req.session.fileCache[fileName].asyncCss == undefined && key !== undefined) {
                    req.session.fileCache[fileName].asyncCss = key.replace(/<style async>/gmi, "").replace(/<\/style>/gmi, "")
                }
                return "";
            });

            resolve(removeAsyncCss)
        }
        catch(e) {
            console.log(e);
            return '';
        }        
    })
}

const extractHtml = async function(input, fileName, req) {
    return new Promise((resolve) => {
        try {
            // Remove any duplicate CSS
            let removeHtml = input.replace(/<template>([\S\s]*?)<\/template>/gmi, (key) => {
                if(req && req.session?.fileCache && req.session.fileCache[fileName].data == undefined && key !== undefined) {
                    req.session.fileCache[fileName].data = key.replace(/<template>/gmi, "").replace(/<\/template>/gmi, "")
                }          
                return key.replace(/<template>/gmi, "").replace(/<\/template>/gmi, "")
            });
            resolve(removeHtml)
        }
        catch(e) {
            console.log(e);
            return '';
        }
    })
}

const extractConfig = async function(config, req) {
    try {
        
        let configProps = [ 'description', 'title', 'classes', 'url', 'robots', 'stale' ]

        if(!req.session.meta) {
            req.session.meta = {};
        }
    
        if(config.querySelector) {
            for(let configItem of configProps) {
                if(config.querySelector(configItem) !== null) {
                    req.session.meta[`${configItem}`] = config.querySelector(configItem).textContent || ""
                }
            }
        }
    }
    catch(e) {
        console.log(e);
        return JSON.stringify({ "error" : "An error occurred with your config." })
    }
}

const compressCssJs = async function(req) {    
    let timerUuid = uuid()

    return new Promise(async (resolve) => {
        
        let css = '', asyncCss = '', commonJs = ''
        
        let timerUuid = uuid()
        console.time(`compress-code-${timerUuid}`);

        try {
            css = await readFile('./common.css', req) || "";
            asyncCss = await readFile('./async.css', req) || "";
            commonJs = await readFile('./common.js', req) || "";
        } 
        catch(e) {
            console.log(e)
        }        

        if(req.session.fileCache !== undefined) {
            let cacheTimeCheck = []
            for(let item of Object.keys(req.session.fileCache)) {
                cacheTimeCheck.push(req.session.fileCache[item].cachedCss)
            }
            let cachedCss, cachedAsyncCss
            if(cacheTimeCheck.every((item) => item === true)) {
                cachedCss = await getCached('css', await md5(req.originalUrl))
                cachedAsyncCss = await getCached('asyncCss', await md5(req.originalUrl))
                if(cachedCss) css = cachedCss
                if(cachedAsyncCss) asyncCss = cachedAsyncCss
            }
            
            try {
                if(!cachedCss) {
                    Object.keys(req.session.fileCache).forEach(function(item) {
                        if(req.session.fileCache[item].css !== undefined) {
                            css += req.session.fileCache[item].css
                        }
                    })
                    css = compressCss.minify(css).styles
                    await setCached('css', await md5(req.originalUrl), css)
                }
                if(!cachedAsyncCss) {
                    Object.keys(req.session.fileCache).forEach(function(item) {
                        if(req.session.fileCache[item].asyncCss !== undefined) {
                            asyncCss += req.session.fileCache[item].asyncCss
                        }
                    })
                    asyncCss = compressCss.minify(asyncCss).styles
                    await setCached('asyncCss', await md5(req.originalUrl), asyncCss)
                }
            
            } catch(e) {
                console.log(e)
                resolve(JSON.stringify({"error" : "Issue compressing CSS and JS"}))
            }
        }
        
        console.timeEnd(`compress-code-${timerUuid}`);

        resolve({
            css: css,
            asyncCss: asyncCss,
            js: commonJs
        });
    });
}

const extractRoutes = async (page, post) => {
    let routes = [];
    let pageLocation = `./views/pages/${page}`

    if(post === true) {
        pageLocation = `./views/post/${page}`
    }
    
    let openPage = await readFile(pageLocation)
    
    if(!openPage) return {}

    const { document } = parseHTML(`<!DOCTYPE html><html><body id="main">${openPage}</body></html>`)
    
    let getUrl = document.querySelector('config url') ?? false ? document.querySelector('config url').textContent : false
    let headless = document.querySelector('config headless') ?? false ? document.querySelector('config headless').textContent : false
    let cache = document.querySelector('config cache') ?? false ? document.querySelector('config cache').textContent : false
    let stale = document.querySelector('config stale') ?? false ? document.querySelector('config stale').textContent : false

    if(getUrl) {
        try {
            routes = JSON.parse(getUrl.replaceAll("'", '"'));
        }
        catch(e) {
            console.log(e);
            return JSON.stringify({ "error" : `Your URL configuration is not valid JSON for ${page}`});
        }
    }
    return {
        routes: routes,
        headless: headless,
        cache: cache,
        stale: stale
    }
}


export { extractCss, extractHtml, extractConfig, extractRoutes, compressCssJs }