import { fileURLToPath } from 'url'
import path from 'path'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '.env') });

// Models
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js'

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

export { apiVerification }