// token.api.js
import express from 'express'
import { promises as fs } from 'fs'
import jwt from 'jsonwebtoken'

// create application/json parser
let jsonParser = express.json()

const tokenApi = express.Router();

tokenApi.post('/token', jsonParser, async function(req, res) {
    try {
        // Private key
        let privateKey = await fs.readFile('./certificates/jwt.key', 'utf8');
        // Generate a JWT
        let token = jwt.sign({ 
            data: {
                username: req.headers.username,
                apiKey: req.headers.apikey
            },
            exp: Math.floor(Date.now() / 1000) + (60 * 60),
            issuer: `${process.env.rootUrl}`,
            alg: 'RS512'
        }, privateKey, { algorithm: 'RS512' });
        
        return res.status(200).send({ "token" : token })
    } 
    catch(e) {
        console.log(e);
        return res.status(400).send({ "error" : "An Error occurred. Please try again later" });
    }

});


export { tokenApi } 