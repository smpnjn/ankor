// Static pages can be placed as files in ./outputs/page/*.page.html. These will be parsed as HTML
// You can use these template tags by default in the HTML:
// |- {{sidebar}}    - ./outputs/components/sidebar.general.html
// |- {{header}}     - ./outputs/components/sidebar.general.html
// |- {{banner}}     - ./outputs/components/banner.general.html
// |- {{footer}}     - ./outputs/components/footer.general.html
// |- {{year}}       - current year
// |- {{series}}     - a list of all series
// |- {{categories}} - a list of all categories

// If you do not define custom settings in this file, then a static page will simply be parsed under 
// the route /name if for example the file is called name.page.html. The default process.env name and description
// will be used.

const definedPages = {
    "privacy.page.html" : async (req) => {
        return {
            route: '/privacy',
            title: 'Fjolt - Privacy Policy',
            robots: 'index,follow',
            description: 'Welcome to Fjolt, and thank you for subscribing. This document describes our privacy policy.',
        }
    },
    "unsubscribe.page.html" : async (req) => {
        return {
            route: '/unsubscribe/:email',
            title: `${process.env.websiteName} - Unsubscribe`,
            robots: 'nofollow,noindex',
            beforeStart: async (data) => {
                // Enclosed function which runs before the file is loaded
                let findEmail = await data.Subscription.find({ "email" : req.params.email || "" });
                if(findEmail.length > 0) {
                    await data.Subscription.deleteOne({ "email" : req.params.email || "" });
                } 
            }
        }
    }
}

export { definedPages }