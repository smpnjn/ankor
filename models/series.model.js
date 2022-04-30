import mongoose from 'mongoose'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../', '.env') });

mongoose.createConnection(process.env.mongooseUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

const schema = new mongoose.Schema({ 
    title: 'string',
    canonicalName: 'string',
    date: 'number',
    seriesItems: [ {
        title: 'string',
        icon: 'string',
        description: 'string',
        subArea: 'string',
        canonicalName: 'string'
    }],
    seriesPage: 'boolean',
    description: 'string',
    shortDescription: 'string',
    icon: 'string'
});

const Series = mongoose.model('Series', schema);

export { Series };