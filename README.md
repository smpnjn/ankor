FJOLT is a blog built in Node.JS and Express, designed to be lightweight and **Server Side Rendered** (SSR). It has a simple implementation of components, which accepts both **async** and **non-async** CSS, meaning you can optimise which CSS is loaded. It is optimized for Linux web servers. 

## Features and Optimizations
FJOLT currently has the following optimisations to improve page load speed:
- **Componentization** - ading only the CSS and JS you need to the pages that load
- **File compression** - CSS and JS is compressed upon `git pull` optimizing load speeds
- **SEO** - optimized for social and SEO, with all meta tags you need including canonicals.
- **Image optimization** - any valid image file loaded via API will be converted into an optimized .webp version as well.
- **GZip** - GZip compression by default on all routes.
- **Redis Cache** - every `GET` request caches page data in a local Redis store meaning instantaneous page loads, with very little delay in "time to first byte"
- **Custom Service Worker** - a service worker caches both the current page and the 20 latest posts, along with all categories, meaning almost instantaneous load for most users visiting your site and only viewing the latest content. This is performed after page load, so does not affect load times.
- **Forced Recaching** - forced recaching is the term I use to describe the caching behaviour used on FJOLT. When you load a page, Redis caches it on the server, and then a service worker caches it locally. After caching with the service worker, the server will not generally be pinged again, meaning the Redis version of the site can go stale. To ensure content does not go stale, any page use will trigger a deferred recache API event, that updates the Redis cache in the background. That means the user will be served the latest cached version for optimum speed, but the server will update the page in the background, so that next time anyone visits, the page will be the most up to date version.

## Future Feature ideas
I'm always open to new ideas, but currently I am considering this for the future:
- [x] **Progressive Web App Capabilities**
- [ ] **History API for seamless loading**
- [ ] **Exploration of other compression algorithms besides GZip and WebP**
- [ ] **Improved componentization**
- [x] **Moving API importance to MongoDB rather than hardcoding**
- [ ] **Standardization of all unique IDs for models to `canonicalName` - i.e. `title` for categories, `name` for author, etc**

## Installation

### PREREQUISITES
- You must have Redis installed - [Find out how to install Redis](https://fjolt.com/article/redis-how-to-install).
- You must have MongoDB installed - [Find out how to install MongoDB](https://www.mongodb.com/docs/manual/installation/). The connection string for your MongoDB install can be placed in your `.env` file.
- **If** you want subscription emails, you will need to have a webmail server and login credentials. This is easy to do in systems like Plesk - just setup an email, and get SMTP login details for it.


Clone the repo to any location. Rename `.env.example` to `.env`, and change its content so that it is relevant to your project.

If you want the githook script to run, then change the githook location by running the following command where you want to clone the repo:
```
git config core.hooksPath .githooks
```

Run `npm install`. You can then start the entire application by running the following two commands. Only the first is required if you don't plan to have a subscription service:

```
pm2 start index.js
pm2 start ./daemons/subscription.daemons.js
```

### Set up First User
When you clone the repo, you will need to make your first user. The first user created has no security attached. Once a user is created, the API key, password, and username will have to be used for any subsequent API calls.

To create your first user, send a POST request with the following JSON body to **https://your-website.com/api/user**:
```javascript
{
    "username": "some-user-name-goes-here",
    "password": "some-password-goes-here",
    "apiEnabled": true
}
```

This will also create a number of roles and access permissions for APIs. These roles are the defaults, but can later be updated via APIs.

### Set up of First Category and Author
As well as setting up your first user, you will need to create a category and author via one of FJOLT's APIs. You can learn more about how that works in the API section below.

## Roles
When this first user is made, we also make four roles - **admin**, **root**, **writer** and **contributor**. Both **admin** and **root** are exactly the same throughtout FJOLT - but it means you can use either if you forget which one to use. They have an importance of 9999, which means they can run any APIs.

All default roles are shown below:
- **admin** - generalised admin endpoint (importance of **9999**)
- **root** - generalised admin endpoint (importance of **9999**)
- **writer** - which can run any article, image or author API (importance of **1**).
- **contributor** - which can run any article, image, author, series or quiz API (importance of **2**).

You can make your own custom roles too. By default, the first user made will have the role **admin**.

### Authors
By default, no authors will exist. Authors are different from users, in that they are not related to users in terms of data architecture, and you can have many authors whilst only maintaining one user. To create your first author so that you can write articles 

## Pages
FJOLT has a bunch of default pages - these are: "home", "category", "search", "article", "draft", "quiz", "404" and "series". Each of these will have some form of customization in the codebase, to show categories, search results, or series pages. Any other page you create in the ./output/pages/ folder which does **not** have one of these names, will be served as a static page. These static pages have to be in the format *.page.html

### Templating
FJOLT has a limited template engine. Essentially, almost all HTML is stored in `./outputs`, with a few exceptions. These exceptions are stored in `./views`. In the future, all content within `./views` will slowly be moved into pure HTML templates. On all pages, anything found in the `./outputs/generic` folder is available, so that we can use headers, footers, and sidebars on any page you like.

When a page is created in the `./outputs/page` folder, it can also have a corresponding template folder. For example, and HTML file in the `./outputs/article` folder will be available to the `./outputs/page/article.page.html` file. 

For example, if a new component is created within the `./outputs/article` folder called `someComponent.component.html`, it would be accessible in `article.page.html` by adding `{{someComponent}}`. **Currently, new components must be static and have no associated database data**, unless you change the controller itself. In the future, this will change.

The `createPage` function is used to bind components and data together in the controller. It has the format:
`createPage('pageName.page.html', { ...customTagsAvailableToPage }, { dataBoundToComponents }, { SEOandCanonicalData })`

For example, on the `/article/:canonicalName` endpoint in `article.controller.js`, we use the function like so:
```javascript
req.output = await createPage('article.page.html', {
    ...articleData,
    more: await articleStructure.generateMore(article.canonicalName, article.category),
    content : articleContent,
}, {
    category: await Category.findOne({ title: article.category }).lean(),
    author: await Author.findOne({ name: article.author }).lean(),
    quiz: await Quiz.findOne({ associatedCanonical: article.canonicalName }).lean(),
    series: seriesData,
}, {
    title: title,
    description: articleData.description,
    canonical: `${process.env.rootUrl}/article/${article.canonicalName}`,
    classes: classes.join(' ')
}, req);
```

### This does the following:
- Adds a few custom template tags, such as `{{more}}` and `{{content}}`, which can be used within 'article.page.html'.
- Adds data to some components, i.e. `await Category.findOne()` is added to `category`, so this means all the data within that query such as category names, canonical names, and descriptions, will be available to the `category.component.html` file within the `./outputs/article` folder.
- Similarly, all the `await Author.findOne()` data will be available within the `./outputs/article/author.component.html` file.
- Then, we pass across `title`, `description`, `canonical`, and any `<body class="*">` body classes.
- Finally we pass along the request, which helps with caching.

### Pros and Cons
This kind of templating is quite useful, in that it confines a specific set of components to a specific page. It's useful for FJOLT where page structure is not complicated, but it does mean we can't use components across pages. In the future there will be the option of having cross-page components, although this does present some performance issues when loading a page for the first time. This is because on the first load, a page is not Redis-cached, so the time to first byte can be slow. After its first load, howevever, time to first byte is typically immediate and not a limiting factor to page speed.

#### Future Backlog Ideas 
**These currently do not work, but may work in the future:**
- **Binding data directly in HTML documents** - i.e. `<{ data: Table }>` at the top of a component will symbolise which MongoDB table to bind to this component. For example, if we wrote `<{ data: Category }>`, any field within the `Category` table would be available within that template.
- **Common templates** - a new solution to be thought up to solve the problem of providing common templates to users.

## APIs
There are 7 sets of APIs which are used to update and submit new content to the database. **All API endpoints are POST**, while all controller endpoints are GET requests with few exceptions. They can all be accessed easily with a tool like Postman.

### Table of Contents
- [API Authentication](#API-Authentication)
- [Article APIs](#Article-APIs)
- [Author APIs](#Author-APIs)
- [Category APIs](#Category-APIs)
- [Image APIs](#Image-APIs)
- [Quiz APIs](#Quiz-APIs)
- [Role APIs](#Role-APIs)
- [Series APIs](#Series-APIs)
- [User APIs](#User-APIs)
- [Token APIs](#Token-APIs)
- [Access APIs](#Access-APIs)

### API Authentication
FJOLT supports two authentication methodologies - **Basic Username/Password Authentication** and **JWT Based Authentication**. You can set this in your `.env` file:

Once a user is created, please add the following headers to all API requests:
```
# Security configuration. Can be set to basic or jwt
authorization=basic
```

#### Basic Authentication
If you are using basic authentication, you can add the following headers to your API request. You will require your **username**, **password**, and **apiKey** to connect to an API endpoint with basic authentication.

```
username: username-for-your-user
password: password-for-your-user
apiKey: api-key-for-your-user (provided when user is created)
```

#### JWT Authentication
JWT authentication provides a slightly more secure way to access API endpoints. First, you need to do a request to the `/api/token` endpoint to get your JWT token. To do this, send a **POST** request to `/api/token` with the following headers:
```
username: username-for-your-user
password: password-for-your-user
apiKey: api-key-for-your-user (provided when user is created)
```
The token endpoint **always** accepts a username, password and API key. The token produced is valid for 1 hour. You can now authenticate with any other API endpoint by adding the token and your API key to your request headers, as shown below:
```
token: your-json-web-token-generated-from-token-api-goes-here
```

#### Access by Roles
Each set of APIs within FJOLT will have a defined `accessLevel`. This is stored within a table called 'access' in MongoDB. Default values will be created, but these can be changed via API. Whilst admin and root users can use all API endpoints, if you are a writer or contributor your access will be more limited. You can read about [role access here](#Roles).

**Some API requests may have other custom headers**. If they do, they are listed below.

### Article APIs
Article APIs concern themselves with creating and modifying articles. **This section will give you an overview of how to submit and create articles**.

#### /api/article
Creates a new article which will show up in archives, categories, searches and tags. Accepts a **POST** request in the following JSON format:
```javascript
{ 
    // Main H1 title of article
    "titles": [
        { "title" : "title of article" }
    ], 
    // List of tags for this article
    "tags": [ "array", "of", "tags" ], 
    // SEO description for this article
    "description": "description of article",
    // the slug for this article, which appears after your-website.com/article/*
    "canonicalName": "name-of-slug-for-article",
    // A valid author username
    "author": "author-of-articles-username",
    // A valid category name for this article
    "category": "category",
    // Whether or not this article shows on archive pages. It will show if set to true
    "mainPage" : true | false,
    // Name of an associated series
    "series" : "none" | false | "name of series"
    // customSeries is not used if "series" (above) is set to "none" or false, or if the series name is invalid.
    "customSeries" : {
        "title" : false | "name of item in series view",
        "subArea": false | "name of sub area within series view"
    },
    // A short description
    "shortDescription": "a short description, used in the series view", 
    // Example shown, the icon/emoji associated with this article
    "icon": "👇" 
}
```

#### /api/article/update
Allows you to update an existing article. **All fields are optional except for `canonicalName`, which must be provided.** Accepts a **POST** request in the following format:

```javascript
{ 
    // Main H1 title of article
    "titles": [
        { "title" : "title of article" }
    ], 
    // List of tags for this article
    "tags": [ "array", "of", "tags" ], 
    // SEO description for this article
    "description": "description of article",
    // the slug for this article, which appears after your-website.com/article/*
    "canonicalName": "name-of-slug-for-article",
    // A valid author username
    "author": "author-of-articles-username",
    // A valid category name for this article
    "category": "category",
    // Whether or not this article shows on archive pages. It will show if set to true
    "mainPage" : true | false,
    // Name of an associated series
    "series" : "none" | false | "name of series",
    // A short description
    "shortDescription": "a short description, used in the series view", 
    // Example shown, the icon/emoji associated with this article
    "icon": "👇" 
}
```

#### /api/document/:canonicalName
For submitting a new article text. Both markdown and HTML are accepted formats. Accepts a **POST** request with a raw HTML body. 

The `:canonicalName` must be the same as the `canonicalName` in your `/api/article` call. For example, if you want the slug of your article to be '**my-cool-article**', then submit `/api/document/my-cool-article`, and then use '**my-cool-article**' as your `canonicalName` in your `/api/article` call.

If you have not submitted an article with the `/api/article` endpoint yet, then your article will immediately be available via `/draft/my-cool-article`. If you have, then it will be avaiable via `/article/my-cool-article`. All drafts are not indexed on search engines, but are available to anyone who knows the `canonicalName`

##### Custom Headers
```
md: true // SET TO true if a markdown document
keepOldDate: true // SET TO true if you don't want the date to update when you update an existing article.
```

#### /api/article/delete/
For deleting an article with a specific `canonicalName`. Accepts a **POST** request with the following JSON body:
```javascript
{
    "canonicalName" : "article-slug-to-delete"
}
```

### Author APIs

#### /api/author
Creates a new author. Accepts a **POST** request with the following JSON format:
```javascript
{ 
    // Full display name of the usr
    "displayName": "Full Name of User",
    // The username of the user.
    "name": "user-name", 
    // Description of the user
    "description": "Description of user, not really used",
    // An array of social accounts
    "social": [
        { "socialType": "twitter" | "github", "username": 'string' }
    ],
    // Images are stored in /images/author-images/*.png. These can be submitted with one of the Image API endpoints
    "image": "name-of-image.png"
}
```
You can have multiple social accounts. Currently, github and twitter compile into an html string which is stored in the database as `socialHtml`. This can be used in HTML templates.

#### /api/author/delete
Deletes an author. Accepts a **POST** request with the following JSON format:
```javascript
{
    "name" : "user-name"
}
```
The username given will be deleted.

### Category APIs

#### /api/category
Creates a new category for putting articles in. You must have a category to create an article. It accepts a **POST** request with the following format:
```javascript
{ 
    // this is used as the slug for the category, i.e. /category/url-friendly-title
    "title": "url-friendly-title",
    // this is the title used on pages
    "displayTitle": "Main Title of Category",
    // this is the description of the category
    "description": "Description of Category", 
    // can be an emoji, or even HTML i.e. <i class='fa-light fa-s'></i>
    "icon": "icon-for-category",
    // Array of tags
    "tags": [ "array", "of", "tags" ],
    // The two colors associated with this category. Used to create default featured images
    "color" : [ "#ec2c5e", "#ff5858" ]
}
```

#### /api/category/delete
Deletes a category with a specific `title`. Accepts a **POST** request with the following format:
```javascript
// Pass in the title of the category you want to delete
{ "title" : "url-friendly-title" }
```

### Image APIs

There are three image endpoints, all of which accept **POST** requests. They accept a request in the form of `form-data` with the following format:
```
image: FILE.png
```

It is easy to add files to `form-data` with Postman.

- `/api/image/content` - Submits an image for use within an article. Stored in the `./public/images/misc` folder.
- `/api/image/author` - Submits an image for an author. Stored in the `./public/images/author-images` folder.
- `/api/image/article` - Submits an image which is used as the main image for an article. It must have the same name as the `canonicalName` of that article. For example, if your article's `canonicalName` is `some-slug-name`, then submit an image called `some-slug-name.png`. Stored in the `./public/images/intro-images` folder.

**All image endpoints creates a complimentary .webp version**, so that you can have a lower bandwidth alternative when writing articles. If you are using markdown, you can reference any image submitted via the `/api/content/image` endpoint, by just typing its name. For example, `![Some Image Alt Text](my-image)` will reference both `./public/images/misc/my-image.png` and `./public/image/misc/my-image.webp` within a `<picture>` tag.

### Quiz APIs

#### /api/quiz
Used to create a quiz. Accepts a **POST** request in the following format:
```javascript
{
    // The canonical for the article this quiz is about. Make sure it matches a valid article canonicalName
    // If the article is part of a series, the quiz will also show up in the series view
    "associatedCanonical": "some-article",
    // The canonical name for this particular quiz. This is used in the article slug, i.e. /quiz/some-quiz-name
    "canonicalName": "some-quiz-name",
    // The description for this quiz
    "quizDescription": "Some description for this quiz",
    // The main h1 title for the quiz
    "title": "Some title for this quiz",
    // All questions go within this array
    "questions": [
        {
            // Questions consist of a set of options the user can select
            // All options are put within the "options" property
            "options": [
                "*",
                "**",
                "%",
                "%%"
            ],
            // The question text itself is shown below
            "question": "Which of these is an invalid mathematical operator?",
            // The correct answer. Since it is "3" here, the correct answer is "%%"
            // Since we select the third index from "options" (and indexes start from 0)
            "answer": 3
        }
    ]
}
```

#### /api/quiz/delete
Used to delete a quiz with a specific `canonicalName`. Accepts a **POST** request with the following format:
```javascript
// Change to the canonical name for the quiz you want to delete
{ "canonicalName": "quiz-canonical-name" }
```

### Role APIs

#### /api/role
Used to create a custom role with a custom importance. Accepts a **POST** request in the following format:
```javascript
{
    "role": "contributor",
    "importance": 2
}
```
If the role already exists, it will be updated.

Importance can be used to set custom API importance settings. Currently this is defined within the code itself. In the future this will be updated to be either database configurable or within `.env` - preferrably the former, to avoid the need for a pull.

#### /api/role/delete
Used to delete a role with a specific `role` name. Accepts a **POST** request in the following format:
```javascript
{
    "role": "contributor"
}
```

### Series APIs

These APIs are used to create series. Series are posts related to each other. For example, a series called "Learn Javascript" may have a number of "articles" associated with it. These routes creates a custom series page with the URL `/series/*`.

#### /api/series
Used to create a series. Accepts a **POST** request in the following format:
```javascript
{
    // Main title for your series
    "title": "Some H1 Title",
    // The name that appears after '/series/*' - i.e. the slug for the series
    "canonicalName": "slug-name-for-this-serie",
    // The description of the series
    "description": "Description of the series.",
    // A shorter description for display in menu items etc 
    "shortDescription" : "A short description",
    // If set to false, no /series/* page will be produced
    "seriesPage": true | false,
    // Since series can have sections, the below is an object of all sections and the articles they contain
    // For example, below there are two sections, "Some Section" and "HTML Can". They contain 2 articles each
    // FJOLT will check the articles table for articles with matching `canonicalName`s. If they're found, they 
    // will be updated to be assigned to this particular series, and the data contained within them will be used
    // to create new series items within this Series document
    "seriesItems": { "Some Section" : [ "some-article-slug", "another-article-slug" ],  "HTML Can" : [ "article-slug", "additional-article-slug" ] }
}
```
#### /api/series/add/:canonicalName
Deletes a series with a particular `canonicalName`. Accepts a **POST** request. No body is required, just add a valid `canonicalName` to the route request.

#### /api/series/delete/

### User APIs
When you make your first user, no authentication will be required. After that, all APIs including the user APIs require authentication with the API Key, password, and username for that user.

#### /api/user
Creates a new user. Accepts a **POST** request in the following format:
```javascript
{
    "username": "username",
    "password": "password",
    // If set to false, all APIs will be disabled for this user
    "apiEnabled": true | false
}
```

#### /user/delete/
Deletes a user with the username `:username`. Accepts a **POST** request with the body shown below. **NOTE** ensure you maintain one user in production, as otherwise all APIs will default to no authentication required.
```javascript
{
    "username" : "username"
}
```

#### /api/subscribe
Allows a user to subscribe to the newsletter. Accepts a **POST** request. No authentication required.
```javascript
{
    // Email to add to the subscriptions database
    "email": "someValidEmail@fjolt.com"
}
```

### Access APIs

#### /access

Allows you to update or create a new access code for an API. Accepts a **POST** request with the following JSON:
```javascript
{
    // Name of API to apply these to. All routes should contain this name, for this to work.
    // If a POST request is sent to a route not found here, it will fail.
    "api" : "name-of-api"
    // The access level relates to the role access given in the Role table. Any user with a 
    // role which has an importance greater or equal to this value, will be able to use this
    // API route
    "accessLevel" : 9999
}