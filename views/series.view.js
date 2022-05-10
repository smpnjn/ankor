import { Series } from '../models/series.model.js';

const seriesStructure = {
    allSeries: async function() {
        const allDocuments = await Series.find({}).sort('-date').limit(10);
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
    },
    generateMore: async function(exclude, category) {
        try {
            let getSeries = await Series.aggregate([{
                $sample: { size: 8 } 
            }]);
            let html = '<ul>';
            if(getSeries.length > 0) {
                for(let i = 0; i < getSeries.length; ++i) {
                    html += `<li><a href="/series/${getSeries[i].canonicalName}"><span class="icon">${getSeries[i].icon}</span> ${getSeries[i].title}</a></li>`;
                }
            } else {
                html += `<li>No Relevant Series to Display.</li>`;
            }
            html += '</ul>';

            return html;

        } catch(e) {
            console.log(e);
        }
    }
}
export { seriesStructure };