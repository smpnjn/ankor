import bcrypt from 'bcrypt'
import { nanoid } from 'nanoid'
import jwt from 'jsonwebtoken'
import { refreshModel, importModels } from './data.js'

const config = await import('../ankor.config.json', { assert: { type: "json" } }).then((data) => data.default)
const models = await importModels()

/**
 * Basic auth for API endpoints
 * @param {object} req - express.js request object
 * @param {string} accessLevel - the access level for this API
 */
const basicAuth = async function(req, accessLevel) {
    return new Promise(async (resolve) => {
        if(accessLevel === 0) {
            resolve(true);
        }
        else if(req.headers.username !== "undefined") {
            const getUser = await models['user'].data.findOne({ "username" : req.headers.username });
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
                                    let checkRole = await models['role'].data.findOne({ role: getUser.role });
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

/**
 * JWT token based auth for API endpoints
 * @param {object} req - express.js request object
 */
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
                    let getUser = await models['user'].data.findOne({ "username": decodedToken.data.username });
                    let checkRole = await models['role'].data.findOne({ role: getUser.role });
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

/**
 * API verification for API endpoints
 * @param {object} req - express.js request object
 * @param {string} accessLevel - the access level for this API
 */
const apiVerification = async function(req, accessLevel) {
    return new Promise(async (resolve, reject) => {
        const getUsers = await models['user'].data.find();
        const userCount = getUsers.length;
        if(userCount == 0) {
            resolve({ noUser: true });
        }
        if(config.api === undefined || config.api === "basic") {
            try {
                let checkAuth = await basicAuth(req, accessLevel);
                resolve(checkAuth);
            }
            catch(e) {
                console.log(e);
            }
        }  
        else if(config.api === "jwt") {
            try {
                let checkAuth = await jwtAuth(req);
                resolve(checkAuth);
            }
            catch(e) {
                console.log(e);
            }
        }
    });
}

/**
 * Creation of first user
 * @param {object} req - express.js request object
 */
const initUserRole = async function(req, res) {

    const defaultRoles = {
        "admin" : 9999,
        "root" : 9999,
        "writer" : 1,
        "contributor" : 2
    }

    for(let role of Object.keys(defaultRoles)) {
        const checkRole = await models['role'].data.find({ "role" : role })
        if(checkRole.length === 0) {
            const newItem = new models['role'].data({ 
                "role" : role,
                "importance" : defaultRoles[role]
            })

            await newItem.save(async function (err) {
                if (err) {
                    return res.status(400).send(err);
                } else {
                    await refreshModel('role', models['role'].data, true)
                }
            });
        }
    }

    bcrypt.hash(req.body.password, 15, async (err, hash) => {
        if(err) {
            return res.status(400).send({ 
                "sucess" : false,
                "message" : "An error occurred while creating your user."
            });
        }
        let firstUser = new models['user'].data({
            username: req.body.username,
            password: hash,
            apiEnabled: req.body.apiEnabled,
            apiKey: nanoid(26),
            role: 'root'
        })

        await firstUser.save(async function (err) {
            if (err) {
                return res.status(400).send(err);
            } else {
                await refreshModel('user', models['user'].data, true)
                return res.status(400).send({ 
                    "sucess" : true,
                    "message" : "Object saved"
                });
            }
        });
    }) 
}

export { apiVerification, initUserRole }