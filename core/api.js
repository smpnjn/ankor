import { writeFile } from './files.js'
import { refreshModel, importModels } from './data.js'
import { apiVerification, initUserRole } from './auth.js'
import bcrypt from 'bcrypt'
import { nanoid } from 'nanoid'
import multer from 'multer'
import cwebp from 'cwebp'
import sanatizeFilename from 'sanitize-filename'
import fs from 'fs'

const form = multer()

/* Config file */
let config = await import('../ankor.config.json', { assert: { type: "json" } }).then((data) => data.default)

/* Get all models.. */
const models = await importModels()

const initiateApi = function(app, jsonParser, htmlParser) {
    let modelKeys = Object.keys(models)
    for(let item of modelKeys) {
        createApi(item, app, 'post', models[item], jsonParser)
        readApi(item, app, 'get', models[item], jsonParser)
        updateApi(item, app, 'post', models[item], jsonParser)
        deleteApi(item, app, 'post', models[item], jsonParser)

        /* For updating specific arrays within items */
        let objectModel = Object.keys(models[item].data.schema.obj)
        for(let objectProp of objectModel) {
            if(Array.isArray(models[item].data.schema.obj[objectProp])) {
                updateArrayApi(item, objectProp, app, 'post', models[item], jsonParser)
            }
        }
    }

    if(config.fileApi) {
        /* Configuring file APIs */
        let fileApiKeys = Object.keys(config.fileApi)
        for(let fileApiKey of fileApiKeys) {
            if(!config.fileApi[fileApiKey].fileType) return

            if(config.fileApi[fileApiKey].fileType === 'md' || config.fileApi[fileApiKey].fileType === 'html') {
                if(fileApiKey[0] !== '/') {
                    fileApiKey = `/${fileApiKey}`
                }
                app['post'](`/api${fileApiKey}`, htmlParser, async (req, res, next) => {
                    try {
                        if(!req.params.fileName) { 
                            return res.status(400).send({ 
                                "success" : false,
                                "error" : "Please define a file name in your API route" 
                            }); 
                        }
                        if(!config.fileApi[fileApiKey].location) {
                            return res.status(400).send({ 
                                "success" : false,
                                "error" : "Please define a location in your fileApi config" 
                            }); 
                        }
                        let writePath = `${config.fileApi[fileApiKey].location}/${sanatizeFilename(req.params.fileName)}.${config.fileApi[fileApiKey].fileType}`
                        if(writePath[0] === '/') {
                            writePath = writePath.slice(1)
                        }
                        
                        /* Run writeFile */
                        let fileResult = await writeFile(req.body, writePath, config.fileApi[fileApiKey].fileType, config.fileApi[fileApiKey].parseCode)

                        return res.status(200).send({ 
                            "success" : fileResult.success,
                            "message" : fileResult.message
                        });

                    } catch(e) {
                        console.log(e);
                        return res.status(400).send({ 
                            "success" : false,
                            "error" : "An internal error occurred. Please try again later" 
                        });
                    }
                });
            }
            else if(config.fileApi[fileApiKey].fileType === 'image') {
                // Add an image for a specific article
                if(fileApiKey[0] !== '/') {
                    fileApiKey = `/${fileApiKey}`
                }
                app['post'](`/api${fileApiKey}`, form.single('image'), async function(req, res) {
                    if(req?.file !== undefined) {
                        try {
                            let fileName = req.file.originalname;
                            let buffer = req.file.buffer;
                            let location = config.fileApi[fileApiKey].location

                            if(req.params.fileName) {
                                fileName = req.params.fileName
                            }
                            
                            fs.writeFileSync(`.${location}/${sanatizeFilename(fileName)}`, buffer)
                    
                            if(req.file.mimetype !== 'image/webp') {
                                const encoder = new cwebp.CWebp(`.${location}/${sanatizeFilename(fileName)}`);
                                encoder.quality(50);
                                let getFileName = fileName.split('.');
                                getFileName.splice(getFileName.length - 1, 1);
                                const newFileName = `${getFileName}.webp`
                                await encoder.write(`.${location}/${newFileName}`, function(err) {
                                    if(err) {
                                        res.status(400).send({ 
                                            "success" : false,
                                            "message" : err 
                                        })
                                    }
                                });
                    
                                res.status(200).send({ 
                                    "success" : true,
                                    "message" : `File uploaded to .${location}/${fileName} and a .webp version has also been created`
                                })
                            } else {
                                res.status(200).send({ 
                                    "success" : true,
                                    "message" : `File uploaded to .${location}/${fileName}`
                                })
                            }
                        }
                        catch(e) {
                            console.log(e);
                            res.status(400).send({ 
                                "success" : false,
                                "message" : "An internal error occurred. Please ensure you have a file attached and try again." 
                            })
                        }
                    }
                })
            }
        }
    }
}

const genericHandler = async (app, method, model, req, item) => {
    /* Check access for each model */
    if(model.access) {
        let checkApiAuthentication = await apiVerification(req, model.access)
        if(!checkApiAuthentication && !checkApiAuthentication.noUser) {
            return { 
                "success" : false,
                "error" : "Invalid Credentials. Check your Authentication Details." 
            }
        }
        else if(checkApiAuthentication.noUser) {
            if(item === "user") {
                return {
                    "type" : "firstUser",
                    "message" : "Creating first user"
                }
            }
            else {
                return { 
                    "success" : false,
                    "error" : "You have not created a user yet. Please make a user with the /api/user API." 
                }
            }
        }
    }

    /* In case of something unforeseen */
    if(!app[`${method}`] || !model) {
        return { 
            "success" : false,
            "error" : "No model found" 
        }
    }
    else if(model.methods && model.methods.indexOf(method) == -1) {
        return {
            "success" : false,
            "error" : "Method not supported" 
        }
    }
    else {
        return {
            "success" : true
        }
    }
}

const createApi = (item, app, method, model, parser) => {
    
    /* Mount the route */
    app[`${method}`](`/api/${item}/`, parser, async (req, res, next) => {

        let checkError = await genericHandler(app, method, model, req, item)
        if(!checkError.success && !checkError.type) {
            return res.status(400).send(checkError)
        }
        else if(checkError.type === "firstUser") {
            if(req.body.password && req.body.username) {
                return await initUserRole(req, res)
            }
            else {
                return res.status(400).send({ 
                    "sucess" : false,
                    "message" : "You need to provide a username and password for your user"
                });
            }
        }

        try {
            let requiredKeys = Object.keys(model.data.schema.obj);
            for(let item of requiredKeys) {
                let newKeys = []
                if(item.required !== undefined && !item.required || item.required === undefined) {
                    newKeys.push(item)
                }
                requiredKeys = newKeys
            }
            if(requiredKeys.every(key => Object.keys(req.body).includes(key))) {
                if(model.rules !== undefined) {
                    let rules = Object.keys(model.rules)
                    for(let rule of rules) {
                        let invalidRules = []

                        if(model.rules[rule] === "bcrypt" && req.body[`${rule}`]) {
                            req.body[`${rule}`] = await bcrypt.hash(req.body[`${rule}`], 15)
                        }
                        else if(model.rules[rule] === "apiKey") {
                            req.body[`${rule}`] = nanoid(26)
                        }
                        else if(model.rules[rule] === "date") {
                            req.body[`${rule}`] = new Date().getTime()
                            req.body[`${rule}Locale`] = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                        }
                        else if(req.body[`${rule}`] && model.rules[rule].test && !model.rules[rule].test(req.body[`${rule}`])) { 
                            invalidRules.push(rule)
                        }

                        if(invalidRules.length > 0) {
                            return res.status(400).send({ 
                                "sucess" : false,
                                "message" : "One or more of your fields does not match the rules you have defined for it.",
                                "invalidRules" : invalidRules 
                            });
                        }
                    }
                }
                if(model.unique) {
                    if(!req.body[`${model.unique}`]) {
                        return res.status(400).send({ 
                            "sucess" : false,
                            "message" : `You have defined a unique property in your model file which does not exist in your model. Please remove or update the unique value for ${item}.model.js`
                        });
                    }
                    if(!Array.isArray(model.unique)) {
                        model.unique = [ model.unique ]
                    }

                    let uniqueItems = []
                    for(let item of model.unique) {
                        let findItem = await model.data.find( { [`${model.unique}`] : req.body[`${model.unique}`] })
                        if(findItem.length > 0) {
                            uniqueItems.push(item)
                        }
                    }
                    if(uniqueItems.length > 0) {
                        return res.status(400).send({ 
                            "sucess" : false,
                            "message" : `An item already exists which matches another element. Either change the properties below, or update your ${item}.model.js file's unique property`,
                            "duplicateValues" : uniqueItems 
                        });
                    }
                }

                /* Check for any references */
                for(let item of Object.keys(model.data.schema.obj)) {
                    let checkForRef = model.data.schema.obj[item]
                    if(checkForRef.ref || checkForRef[0] && checkForRef[0].ref) {
                        let getRef = await updateARef(model, req.body, item)
                        if(getRef.results && Array.isArray(req.body[`${item}`])) {
                            req.body[`${item}`] = getRef.results
                        }
                    }
                }
                if(checkError.type !== "firstUser") {
                    const itemConstructor = model.data
                    const newItem = new itemConstructor(req.body);

                    if(model.onCreate && Array.isArray(model.onCreate)) {
                        for(let onCreateFunction of model.onCreate) {
                            await onCreateFunction(req.body)
                        }
                    }

                    await newItem.save(async function (err) {
                        if (err) {
                            return res.status(400).send(err);
                        } else {
                            await refreshModel(item, model.data, true)
                            let message = { "success" : true, "message" : "Object saved" }
                            if(model.returns) {
                                for(let item of model.returns) {
                                    if(req.body[`${item}`]) {
                                        message[`${item}`] = req.body[`${item}`]
                                    }
                                }
                            }
                            return res.status(200).send(message)
                        }
                    });
                }
            }
            else {
                return res.status(400).send({ 
                    "sucess" : false,
                    "message" : "You are missing a key from your JSON. Check you have them all.",
                    "requiredKeys" : requiredKeys 
                });
            }
        } catch(e) {
            console.log(e);
            return res.status(400).send({ 
                "sucess" : false,
                "message" : "An Error occurred. Please try again later" 
            });
        }
    })
}

const readApi = (item, app, method, model, parser) => {  
    /* Mount the route */
    app[`${method}`](`/api/${item}/`, parser, async (req, res, next) => {

        let checkError = await genericHandler(app, method, model, req)
        if(!checkError.success) {
            return res.status(400).send(checkError)
        }

        try {
            if(!req.body.query) {
                req.body.query = {} 
            }
            const getData = await model.data.find( req.body.query )
            return res.status(200).send({ 
                "sucess" : true,
                "data" : getData
            });
        } catch(e) {
            console.log(e);
            return res.status(400).send({ 
                "sucess" : false,
                "message" : "An Error occurred. Please try again later" 
            });
        }
    })
}

const updateARef = async (model, body, arrItem) => {
    let keys = Object.keys(model.data.schema.obj[arrItem][0])
    if(keys.indexOf('ref') > -1) {
        let modelKeys = Object.keys(models)
        let reference = model.data.schema.obj[arrItem][0].ref
        for(let item of modelKeys) {
            let modelName = models[item].data.collection.modelName
            if(reference === modelName) {
                /* Model name is ObjectId for this array item */
                if(Array.isArray(body[`${arrItem}`])) {
                    let items = []
                    for(let query of body[`${arrItem}`]) {
                        let findItems = await models[item].data.find(query)
                        for(let item of findItems) { 
                            items.push(item._id)
                        }
                    }
                    return {
                        "success" : true,
                        "results" : items
                    }
                }
                else {
                    return {
                        "success" : false,
                        "message" : "Your delta property needs to be of type array. It can be an array of item(s) or queries you want to insert."
                    }
                }
            }
        }
    }
    return {
        "skip" : true,
        "message" : "No references found."
    }
}

const updateArrayApi = (item, arrItem, app, method, model, parser) => {
    app[`${method}`](`/api/${item}/${arrItem}/:insertionPoint`, parser, async (req, res, next) => {

        let checkError = await genericHandler(app, method, model, req)
        if(!checkError.success) {
            return res.status(400).send(checkError)
        }
        
        let arrSet = model.data.schema.obj[arrItem]

        if(arrSet && req.body.query) {
            let findItem = await model.data.find(req.body.query)
            let insertionPoint = parseFloat(req.params.insertionPoint || 0)
            if(findItem.length > 1) {
                return res.status(400).send({ 
                    "success" : false,
                    "message" : "More than one item in your database was found which matches your query. You can only do this to one item at a time. Please update your query to find a unique result."
                })
            }

            if(isNaN(insertionPoint)) {
                return res.status(400).send({ 
                    "success" : false,
                    "message" : "If you give an insertion point in your URL, please ensure it is a number."
                })
            }

            if(!req.body[`${arrItem}`]) {
                return res.status(400).send({ 
                    "success" : false,
                    "message" : `We couldn't find ${arrItem} in your request body. Please make sure your JSON is of format { "query" : {}, "${arrItem}" : [] }`
                })
            }

            const requiredKeys = Object.keys(model.data.schema.obj[arrItem][0])
            const refUpdate = await updateARef(model, req.body, arrItem)
            let arrayItems = findItem[0][`${arrItem}`]
            if(refUpdate.success) {
                if(arrayItems.length - 1 > insertionPoint) {
                    for(let j = 0; j < refUpdate.results.length; ++j) { 
                        arrayItems.splice(insertionPoint + j, 0, refUpdate.results[j])
                    }
                }
                else {
                    arrayItems = [ ...arrayItems, ...refUpdate.results ]
                }
                model.data.updateOne(req.body.query, { [arrItem] : arrayItems }).then(() => {
                    return res.status(400).send({ 
                        "success" : true,
                        "message" : "Item has been updated"
                    })
                })
            }
            else if(!refUpdate.success && !refUpdate.skip) {
                return res.status(400).send(refUpdate)
            }
            else {
                for(let item of arrayItems) {
                    let objectKeys = Object.keys(item)
                    if(!requiredKeys.every((key) => objectKeys.includes(key))) {
                        return res.status(400).send({ 
                            "success" : false,
                            "message" : "You did not include all the required keys for your data.",
                            "requiredKeys" : requiredKeys
                        })
                    }
                }
                
                if(arrayItems.length - 1 > insertionPoint) {
                    for(let j = 0; j < req.body[`${arrItem}`].length; ++j) { 
                        arrayItems.splice(insertionPoint + j, 0, req.body[`${arrItem}`][j])
                    }
                }
                else {
                    arrayItems = [ ...arrayItems, ...req.body[`${arrItem}`] ]
                }
                
                model.data.updateOne(req.body.query, { [arrItem] : arrayItems }).then(() => {
                    return res.status(400).send({ 
                        "success" : true,
                        "message" : "Item has been updated"
                    })
                })

            }
            
        }
    })
}

const updateApi = (item, app, method, model, parser) => {

    app[`${method}`](`/api/${item}/update`, parser, async (req, res, next) => {

        let checkError = await genericHandler(app, method, model, req)
        if(!checkError.success) {
            return res.status(400).send(checkError)
        }
        
        if(req.body.query) {
            let findItem = await model.data.find(req.body.query)
            if(findItem.length > 1) {
                return res.status(400).send({ 
                    "sucess" : false,
                    "message" : "You can only update one item at a time. Make sure your query selects only one item." 
                });
            }
            else if(findItem.length === 0) {
                return res.status(400).send({ 
                    "sucess" : false,
                    "message" : "We couldn't find the item you requested. Try updating your query." 
                });
            }
            else {
                if(req.body.update) {
                    let requiredKeys = Object.keys(model.data.schema.obj)
                    let errorKeys = []
                    let validKeys = []
                    for(let item of Object.keys(req.body.update)) {
                        if(requiredKeys.indexOf(item) == -1) {
                            errorKeys.push(item)
                        }
                        else {
                            validKeys.push(item)
                        }
                    }

                    if(errorKeys.length > 0) {
                        return res.status(400).send({ 
                            "sucess" : false,
                            "message" : `Some of the keys you provided in "update" are invalid. See below for invalid keys and valid keys`,
                            "validKeys" : requiredKeys,
                            "errorKeys" : errorKeys
                        });
                    }
                    else {
                        for(let item of validKeys) {
                            let checkForRef = model.data.schema.obj[item]
                            if(checkForRef.ref || checkForRef[0] && checkForRef[0].ref) {
                                let getRef = await updateARef(model, req.body.update, item)
                                if(getRef.results && Array.isArray(req.body.update[`${item}`])) {
                                    req.body.update[`${item}`] = getRef.results
                                }
                            }

                            if(model.onUpdate && Array.isArray(model.onUpdate)) {
                                for(let onUpdateFunction of model.onUpdate) {
                                    await onDeleteFuncton(req.onUpdate)
                                }
                            }
                            await model.data.updateOne(req.body.query, { [item] : req.body.update[`${item}`] })
                        }

                        return res.status(200).send({ 
                            "sucess" : true,
                            "message" : `Item updated`
                        });
                    }
                }
                else {
                    return res.status(400).send({ 
                        "sucess" : false,
                        "message" : `Please provide a JSON body in the format { "query" : <query>, "update" : <fields to update> }`
                    });
                }
            }
        }
        else {
            return res.status(400).send({ 
                "sucess" : false,
                "message" : "An error occurred. Please try again later" 
            });
        }

    });
}

const deleteApi = (item, app, method, model, parser) => {
    /* Mount the route */
    app[`${method}`](`/api/${item}/delete`, parser, async (req, res, next) => {

        let checkError = await genericHandler(app, method, model, req)
        if(!checkError.success) {
            return res.status(400).send(checkError)
        }

        if(req.body.query) {
            let findItem = await model.data.find(req.body.query)
            if(findItem.length > 1) {
                return res.status(400).send({ 
                    "sucess" : false,
                    "message" : "You can only delete one item at a time. Make sure your query selects only one item." 
                });
            }
            else if(findItem.length === 0) {
                return res.status(400).send({ 
                    "sucess" : false,
                    "message" : "We couldn't find the item you requested. Try updating your query." 
                });
            }
            else {
                if(model.onDelete && Array.isArray(model.onDelete)) {
                    for(let onDeleteFuncton of model.onDelete) {
                        await onDeleteFuncton(req.body)
                    }
                }
                await model.data.deleteOne(req.body.query).then(() => {
                    return res.status(200).send({ 
                        "sucess" : true,
                        "message" : "Item deleted." 
                    });
                })
            }
        }
        else {
            return res.status(400).send({ 
                "sucess" : false,
                "message" : "An error occurred. Please try again later" 
            });
        }

    })
}

export { initiateApi }