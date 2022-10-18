import express from 'express';
import fetch from 'node-fetch';
import { createClient } from 'redis'
import path from 'path'
import { nanoid } from "nanoid";
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Index.js
import dotenv from 'dotenv'
import { md5 } from 'hash-wasm';
dotenv.config({ path: path.join(__dirname, '.env') });

// Redis Connection
const client = createClient();
client.on('error', (err) => console.log('Redis Client Error', err));
await client.connect();

let cacheApi = express.Router();


cacheApi.post('/cache/session', (req, res, next) => {
    try {
        if(req.session == undefined) {
            req.session = {};
        }
        if(req.session.csrf == undefined) {
            req.session.csrf = nanoid(64);
        }
        if(req.session.csrf !== undefined) {
            return res.status(200).send({ "csrf" : req.session.csrf })
        }
    }
    catch(e) {
        console.log(e);
    }
})
export { cacheApi }