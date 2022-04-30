import { Series } from '../models/series.model.js';

const seriesStructure = {
    allSeries: async function() {
        const allDocuments = await Series.find({}).sort('-date').limit(5);
        var html = '';
        for(let i = 0; i <  allDocuments.length; i++) {
            html += `
            <div class="sub-menu-item">
                <a href="/series/${allDocuments[i].canonicalName}">
                    <span class="sub-menu-item-icon">
                        ${allDocuments[i].icon}    
                    </span>
                    <span class="sub-menu-item-description"><span>${allDocuments[i].title}</span><span>${allDocuments[i].shortDescription}</span></span>
                </a>
            </div>`
        }
        return html;
    }
}
export { seriesStructure };