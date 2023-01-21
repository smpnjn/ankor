import mongoose from 'mongoose'
import { promises as fs } from 'fs'
import canvas from '@napi-rs/canvas' // Don't upgrade this the new version is broken
import cwebp from 'cwebp'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { createCanvas, GlobalFonts } = canvas;

const schema = mongoose.Schema({ 
    titles: [
        { title : 'string' }
    ], 
    canonicalName: 'string',
    date: 'number',
    description: 'string',
    shortDescription: 'string',
    icon: 'string',
    author: 'string',
    tags: [ 'string' ],
    category: 'string',
    mainPage: mongoose.Schema.Types.Mixed,
    series: 'string',
    additionalSeriesData: {
        icon: 'string',
        subArea: 'string',
    }
});

schema.index({canonicalName: 1});

export default {
    "data": mongoose.model('Article', schema),
    "access": 1,
    "unique" : [ "canonicalName" ],
    "rules" : {
        "date" : "date"
    },
    "onCreate" : [
        async (bodyData) => {
            const wrapText = function(ctx, text, x, y, maxWidth, lineHeight) {
                let words = text.split(' ');
                let line = '';
                let testLine = '';
                let wordArray = [];
                let totalLineHeight = 0;
                for(let n = 0; n < words.length; n++) {
                    testLine += `${words[n]} `;
                    let metrics = ctx.measureText(testLine);
                    let testWidth = metrics.width;
                    if (testWidth > maxWidth && n > 0) {
                        wordArray.push([line, x, y]);
                        y += lineHeight;
                        totalLineHeight += lineHeight;
                        line = `${words[n]} `;
                        testLine = `${words[n]} `;
                    }
                    else {
                        line += `${words[n]} `;
                    }
                    if(n === words.length - 1) {
                        wordArray.push([line, x, y]);
                    }
                }
                return [ wordArray, totalLineHeight ];
            }
                
            const capitalize = (str) => {
                let strings = str.split(' ');
                return strings.map(string => string.charAt(0).toLocaleUpperCase()+string.slice(1)).join(' ');
            }

            GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/Apple-Emoji.ttf'), 'AppleEmoji');
            GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/JetBrains-Bold.ttf'), 'JetBrains');
            GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/Menlo-Bold-Italic.ttf'), 'Menlo-Bold');
            GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/Menlo-Regular.ttf'), 'Menlo');
            GlobalFonts.registerFromPath(path.join(__dirname, '../fonts/HelveticaNeue-Bold.ttf'), 'Helvetica');
        
            // Create canvas
            const canvas = createCanvas(1200, 630);
            const ctx = canvas.getContext('2d')
        
            ctx.fillStyle = '#050506';
            ctx.fillRect(0, 0, 1200, 630);
        
            ctx.font = '76px JetBrains';
            ctx.fillStyle = 'white';
            let wrappedText = wrapText(ctx, `${bodyData.titles[0].title}`, 90, 270, 1000, 120);
            let linePosition = 300;
            wrappedText[0].forEach(function(item, index) {
                if(index === 0) linePosition = item[2] - wrappedText[1];
                ctx.fillText(item[0], item[1], item[2] - wrappedText[1]); 
            })
            // More text
            ctx.font = '38px Menlo-Bold'
            ctx.letterSpacing = "-40px"
            ctx.fillText(`FJOLT`, 90, 526)

            ctx.font = '38px Menlo';
            ctx.letterSpacing = "0px"
            ctx.fillText(`❯`, 215, 524); 

            ctx.font = 'bold 38px Helvetica';
            ctx.letterSpacing = "0px"
            ctx.fillText(capitalize(bodyData.category), 250, 526); 
        
            try {
                const canvasData = await canvas.encode('png')
                
                // Save file
                await fs.writeFile(`./public/images/intro-images/${bodyData.canonicalName}.png`, canvasData);

                const encoder = new cwebp.CWebp(`./public/images/intro-images/${bodyData.canonicalName}.png`)
                encoder.quality(50);
                await encoder.write(`./public/images/intro-images/${bodyData.canonicalName}.webp`, function(err) {
                    if(err) console.log(err);
                });

            }
            catch(e) {
                console.log(e)
            }
        }
    ]
}