import { createClient } from 'redis'
import mongoose from 'mongoose'
import { fileURLToPath } from 'url'
import fs from 'fs'

import path from 'path'
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

const userModel = new mongoose.Schema({ 
    username: 'string',
    password: 'string', 
    apiEnabled: 'boolean',
    apiKey: 'string',
    role: 'string',
})

const roleModel = new mongoose.Schema({ 
    role: 'string',
    importance: 'number'
})

/**
 * reads all models from './models' folder
 */
const getModels = () => {
    let models = fs.readdirSync('./models');
    return models;
}

/**
 * extracts model data and returns an object of model data
 */
const importModels = async () => {
    let models = getModels();
    let modelObject = {};
    for(let x of models) {
        if(x.split('.model.').length > 1) {
            let modelData = await import(`../models/${x}`);
            modelObject[x.split('.model.')[0]] = modelData.default
        }
    }
    
    /* User model is required */
    modelObject['user'] = {
        "data": mongoose.model('User', userModel),
        "access": 999,
        "unique" : [ "username" ],
        "rules" : {
            "password" : "bcrypt",
            "apiKey" : "apiKey"
        },
        "returns" : [ "apiKey" ]
    }

    /* User model is required */
    modelObject['role'] = {
        "data": mongoose.model('Role', roleModel),
        "access": 999,
        "unique" : [ "role" ]
    }

    return modelObject
}

/**
 * refreshes a particular model in redis
 * @param {string} modelName - name of model to refresh in Redis
 * @param {object} dataModel - the mongoose model object
 * @param {boolean} cacheOnly - if true, it will resolve only one data model, if false it will resolve all
 */
const refreshModel = async (modelName, dataModel, cacheOnly) => {
    return new Promise(async (resolve) => {
        try {
            // If this model doesn't have data or a schema, then avoid it.
            if(!dataModel || !dataModel.schema || !dataModel.schema.tree) return;

            // Run query, get schema tree $$$
            let schema = dataModel.schema.tree;
            let query = dataModel.find();

            // Auto populate any `associatedWith` references
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

            // auto populate any associated with tags on L0 of data model
            Object.keys(schema).forEach((j) => {
                if(schema[j].ref !== undefined || schema[j]?.[0]?.ref !== undefined) {
                    query = query.populate(j);
                }
            });

            if(cacheOnly) {
                query.lean().then(async (newData) => {
                    await client.set(`table.${modelName}`, JSON.stringify(newData))
                    if(globalThis.cache && globalThis.cache[`${modelName}`]) {
                        globalThis.cache[`${modelName}`] = newData
                    }
                    resolve(newData)
                });
            }
            else {
                let getRedisData = await client.get(`table.${modelName}`);
                query.lean().then(async (newData) => {
                    client.set(`table.${modelName}`, JSON.stringify(newData))
                });
                if(getRedisData !== null) {
                    // If it does, then add to our returned cache
                    resolve(JSON.parse(getRedisData))
                }
                else {
                    // If it doesn't, then cache it and also return it
                    resolve(await query.lean().exec())
                }
            }

        } catch(e) {
            resolve(false)
        }
    });
}

/**
 * Caches all mongo data in Redis for preferential loading
 */
const refreshData = async () => {

    return new Promise(async (resolve) => {
        let models = await importModels()
        let cachedData = []
        let modelNames = Object.keys(models)

        for(let modelName of modelNames) {
            let dataModel = models[modelName].data
            cachedData[`${modelName}`] = await refreshModel(modelName, dataModel)
        }
        // Resolves a cache of data
        resolve(cachedData)
    });
}

/**
 * returns a cached version of something from redis
 * @param {string} dataType - the type of data to retrieve
 * @param {string} dataId - unique identifier for the data
 */
const getCached = async (dataType, dataId) => {
    return new Promise((resolve) => {
        client.get(`${dataType}.${dataId}`).then((data) => {
            if(data) {
                resolve(data)
            }
            else {
                resolve(false)
            }
        })
    })
}

/**
 * updates cached version of file
 * @param {string} dataType - the type of data to set
 * @param {string} dataId - unique identifier for the data
 * @param {string} content - content of data to set
 */
const setCached = async (dataType, dataId, content) => {
    return new Promise(async (resolve) => {
        client.set(`${dataType}.${dataId}`, await content).then((data) => {
            resolve(data)
        })
    })
}

export { refreshData, refreshModel, getCached, setCached, importModels }