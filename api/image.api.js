// image.api.js
import express from 'express'
import { promises as fs } from 'fs'
import multer from 'multer'
import cwebp from 'cwebp';
import sanatizeFilename from 'sanitize-filename'

const imageApi = express.Router();
const form = multer();

imageApi.use(express.json());
imageApi.use(express.urlencoded({ extended: true }));


// Reusable image uploader function. Creates .webp version as well.
const createImage = async (req, res, location) => { 
    if(req?.file !== undefined) {
        try {
            let fileName = req.file.originalname;
            let buffer = req.file.buffer;
    
            await fs.writeFile(`./public/images/${sanatizeFilename(location)}/${sanatizeFilename(fileName)}`, buffer);
    
            if(req.file.mimetype !== 'image/webp') {
                const encoder = new cwebp.CWebp(`./public/images/${location}/${fileName}`);
                encoder.quality(30);
                let getFilName = fileName.split('.');
                getFilName.splice(getFilName.length-1, 1);
                const newFileName = `${getFilName}.webp`
                await encoder.write(`./public/images/${location}/${newFileName}`, function(err) {
                    if(err) console.log(err);
                });
    
                res.status(200).send({ 
                    "message" : "File uploaded, and a .webp version has also been created"
                })
            } else {
                res.status(200).send({ 
                    "message" : "File uploaded"
                })
            }
        }
        catch(e) {
            console.log(e);
            res.status(400).send({ "error" : "An error occurred. Please ensure you have a file attached and try again." })
        }
    }
}

// Add an image for a specific article
imageApi.post('/image/article', form.single('image'), async function(req, res) {
    createImage(req, res, 'intro-images');
})

// Add an image for an author
imageApi.post('/image/author', form.single('image'), async function(req, res) {
    createImage(req, res, 'author-images');
})

// Add an image for a piece of content (i.e. an article)
imageApi.post('/image/content', form.single('image'), async function(req, res) {
    createImage(req, res, 'misc');
})

export { imageApi }