import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv'
dotenv.config({ path: path.join(__dirname, '../', '.env') });

import mail from 'nodemailer'
import schedule from 'node-schedule'
import { promises as fs } from 'fs'
import mongoose from 'mongoose'
import { parseTemplate } from '../util.js'
import * as Subscription from '../models/subscription.model.js';

// *.view.js
import { articleStructure } from '../views/article.view.js';

const connection = mongoose.connect(process.env.mongooseUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const mailer = async () => {	
    try {
        let email = await fs.readFile('./outputs/email/subscription.email.html', { encoding:'utf-8' } );
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

        let allSubs = await Subscription.Subscription.find();
        let latestArticles = await articleStructure.generateArchiveArticles('email', 0, { email: true });

        allSubs.forEach(async function(item) {
            let text = await parseTemplate(email, {
                'latestArticles' : latestArticles,
                'unsubscribeLink' : `${process.env.rootUrl}/unsubscribe/${item.email}`,
                'privacyPolicy' : `${process.env.rootUrl}/privacy` 
            });
            if(typeof item.email !== "undefined") {
                console.log(item.email)
                transporter.sendMail({
                    from   : `${process.env.websiteName} <${process.env.contactEmail}>`,
                    to     : item.email,
                    subject: process.env.subscriptionEmailTitle,
                    replyTo: process.env.contactEmail,
                    headers: { 'Mime-Version' : '1.0', 'X-Priority' : '3', 'Content-type' : 'text/html; charset=iso-8859-1' },
                    html   : text
                }, (err, info) => {
                    if(err !== null) {
                        console.log(err);
                    }
                    else {
                        console.log(`Email sent to ${item.email} at ${new Date().toISOString()}`);
                    }
                });
            }
        });
        

    } catch(e) {
        console.log(e);
    }
}

if(process.env.subscriptionEnabled === "true" || process.env.subscriptionEnabled == true) {
    schedule.scheduleJob('*/10 * * * * *', async function() {
        try {
            mailer();
        } catch(e) {
            console.log(e);
        }
    });
}
