import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '../', '.env') });

import mail from 'nodemailer'
import schedule from 'node-schedule'
import { parsePage } from '../core/parse.js'
import Subscription from '../models/subscription.model.js';

/* Config file */
let config = await import('../ankor.config.json', { assert: { type: "json" } }).then((data) => data.default)

const mailer = async () => {	
    try {
        let transporter = mail.createTransport({
            host: process.env.contactHost,
            port: 465,
            debug: true,
            pool: true,
            maxMessages: Infinity,
            secure: true,
            auth:{
                user: process.env.contactEmail,
                pass: process.env.contactPassword
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        let allSubs = await Subscription.data.find();
        
        for(let item of allSubs) {
            let text = await parsePage('subscription', { params: { email: item.email }, session: { data: [] } }, true)
            console.log(text)
            if(typeof item.email !== "undefined") {
                transporter.sendMail({
                    from   : `${process.env.websiteName} <${process.env.contactEmail}>`,
                    to     : item.email,
                    subject: process.env.subscriptionEmailTitle,
                    replyTo: process.env.contactEmail,
                    headers: { 'Mime-Version' : '1.0', 'X-Priority' : '3', 'Content-type' : 'text/html; charset=iso-8859-1' },
                    html   : text
                }, (err) => {
                    if(err !== null) {
                        console.log(err);
                    }
                    else {
                        console.log(`Email sent to ${item.email} at ${new Date().toISOString()}`);
                    }
                });
            }
        }

    } catch(e) {
        console.log(e);
    }
}

if(config.mail == true) {
    schedule.scheduleJob('00 30 10 * * 1', async function() {
        try {
            mailer();
        } catch(e) {
            console.log(e);
        }
    });
}
