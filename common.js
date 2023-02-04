let calculateAngle = function(e, item, parent) {
    let dropShadowColor = `rgba(0, 0, 0, 0.3)`
    if(parent.getAttribute('data-filter-color') !== null) {
        dropShadowColor = parent.getAttribute('data-filter-color');
    }
    // Get the x position of the users mouse, relative to the button itself
    let x = Math.abs(item.getBoundingClientRect().x - e.clientX);
    // Get the y position relative to the button
    let y = Math.abs(item.getBoundingClientRect().y - e.clientY);
    // Calculate half the width and height
    let halfWidth  = item.getBoundingClientRect().width / 2;
    let halfHeight = item.getBoundingClientRect().height / 2;
    // Use this to create an angle. I have divided by 6 and 4 respectively so the effect looks good.
    // Changing these numbers will change the depth of the effect.
    let calcAngleX = (x - halfWidth) / 40;
    let calcAngleY = (y - halfHeight) / 4;
    // Set the items transform CSS property
    item.style.transform = `rotateY(${calcAngleX}deg) rotateX(${calcAngleY}deg) scale(1.05)`;
    
    // And set its container's perspective.
    parent.style.perspective = `${halfWidth * 2}px`
    item.style.perspective = `${halfWidth * 3}px`
    if(parent.getAttribute('data-custom-perspective') !== null) {
        parent.style.perspective = `${parent.getAttribute('data-custom-perspective')}`
    }
    // Reapply this to the shadow, with different dividers
    let calcShadowX = (x - halfWidth) / 3;
    let calcShadowY = (y - halfHeight) / 3;
    
    // Add a filter shadow - this is more performant to animate than a regular box shadow.
    item.style.filter = `drop-shadow(${-calcShadowX}px ${calcShadowY}px 15px ${dropShadowColor})`;
}
if(document.querySelectorAll('.hover-button').length > 0) {
    document.querySelectorAll('.hover-button').forEach(function(item) {
        item.addEventListener('mouseenter', function(e) {
            calculateAngle(e, this.querySelector('span'), this);
        });
        item.addEventListener('mousemove', function(e) {
            calculateAngle(e, this.querySelector('span'), this);
        });
        item.addEventListener('mouseleave', function(e) {
            let dropShadowColor = `rgba(0, 0, 0, 0.3)`
            if(item.getAttribute('data-filter-color') !== null) {
                dropShadowColor = item.getAttribute('data-filter-color')
            }
            item.querySelector('span').style.transform = `rotateY(0deg) rotateX(0deg) scale(1)`;
            item.querySelector('span').style.filter = `drop-shadow(0 10px 15px ${dropShadowColor})`;
        });
    })
}
if(window.location.hash === "#subscribe") {
    document.body.setAttribute('data-subscribe', true);
}
if(document.querySelector('.copy') !== null) {
    document.querySelectorAll('.code-options .copy').forEach(function(item) {
        item.addEventListener('click', function(e) {
            const codeContent = item.parentNode.parentNode.querySelector('code').textContent;
            navigator.clipboard.writeText(codeContent);
            this.classList.add('active');
        });
    });
}
if(document.querySelector('.menu-item') !== null) {
    document.querySelector('.menu-item').addEventListener('touchend pointerup', function(e) {
        if(this.querySelector('.sub-menu-items') !== null) {
            if(e.target.matches('.menu-item > span') || e.target.matches('.menu-item > svg')) {
                if(this.querySelector('.sub-menu-items').classList.contains('active')) {
                    this.querySelector('.sub-menu-items').classList.remove('active');
                } else {
                    this.querySelector('.sub-menu-items').classList.add('active');
                    this.querySelector('.sub-menu-items').classList.remove('closed');
                }
            }
        }
    })
}
if(document.querySelector('.menu-item.mobile') !== null) {
    document.querySelector('.menu-item.mobile').addEventListener('pointerup', function(e) {
        if(document.querySelector('#mobile .sub-menu-items') !== null) {
            if(document.querySelector('#mobile .sub-menu-items').classList.contains('active')) {
                document.querySelector('#mobile .sub-menu-items').classList.remove('active');
            } else {
                document.querySelector('#mobile .sub-menu-items').classList.add('active');
                document.querySelector('#mobile .sub-menu-items').classList.remove('closed');
            }
        }
    })
}
if(document.querySelector('.sub-menu-items .close') !== null) {
    document.querySelector('.sub-menu-items .close').addEventListener('pointerup', function() {
        document.querySelectorAll('.sub-menu-items').forEach(function(item) {
            item.classList.remove('active');
            item.classList.add('closed');
        })
    });
}
if(document.querySelector('.ellipsis') !== null){
    document.querySelectorAll('.ellipsis').forEach(function(item) {
        item.addEventListener('click', function(e) {
            let thisSeriesNav = item.parentElement;
            if(item.classList.contains('next-items')) {
                let allItems = thisSeriesNav.querySelectorAll('.visible');
                let lastItem = allItems[allItems.length - 1];
                let itemsToCheck = [ lastItem.nextElementSibling, lastItem.nextElementSibling?.nextElementSibling, lastItem.nextElementSibling?.nextElementSibling?.nextElementSibling ];
                for(let x of itemsToCheck) {
                    if(x !== null && x !== undefined) {
                        x.classList.add('visible');
                    }
                    else {
                        item.style.display = 'none'
                    }
                }
            }
            if(item.classList.contains('prev-items')) {
                let allItems = thisSeriesNav.querySelectorAll('.visible');
                let lastItem = allItems[0];
                let itemsToCheck = [ lastItem.previousElementSibling, lastItem.previousElementSibling?.previousElementSibling, lastItem.previousElementSibling?.previousElementSibling?.previousElementSibling ];
                for(let x of itemsToCheck) {
                    if(x !== null && x !== undefined) {
                        x.classList.add('visible');
                    }
                    else {
                        item.style.display = 'none'
                    }
                }
            }
            e.preventDefault();
            return false;
        })
    })
}
if(document.querySelector('#search input') !== null) {
    document.querySelector('#search input').addEventListener('keyup', function(e) {
        if(e.which == 13) {
            if(typeof this.value == "string") {
                let createUrl = new URL(`/search/${this.value}`, window.location);
                window.location.href = createUrl.href;
            }
        }
    });
}

if(document.querySelectorAll('article').length == 0 && document.getElementById('pagination') !== null) {
    document.getElementById('pagination').remove();
}
if(document.getElementById('pagination') !== null) {
    let skip = 12;
    let limit = 11;
    let filterOn = undefined;
    let filter = undefined
    let search = false;
    let fetchingInProgress = false;
    window.addEventListener('scroll', async function(e) { 
        let documentHeight = document.body.scrollHeight;
        let currentScroll = window.scrollY + window.innerHeight;
        // When the user is 200px from the bottom, fire the event.
        if(currentScroll + 200 > documentHeight) {
            if(fetchingInProgress == false) {
                // Fetching..
                fetchingInProgress = true;
                // Update pagination to loading
                document.getElementById('pagination').innerHTML = '<div class="loader"><div class="lds-ring"><div></div><div></div><div></div><div></div></div></div>';
                // Data to send to get posts
                let page = window.location.pathname;
                if(page.indexOf('/search/') > -1) {
                    search = true;
                    filter = window.location.pathname.split('/search/')[1].split('/')[0];
                    filterOn = 'canonicalName';
                }
                if(page.indexOf('/category/') > -1) {
                    filter = window.location.pathname.split('/category/')[1].split('/')[0];
                    filterOn = 'category';
                }
                if(page.indexOf('/tag/') > -1) {
                    filter = window.location.pathname.split('/tag/')[1].split('/')[0];
                    filterOn = 'associatedWith.tags';
                }
                let jsonBody = { 
                    skip: skip,
                    limit: limit,
                    search: search,
                    filter: filter,
                    filterOn: filterOn,
                };
                let csrf = document.querySelector('[name="csrf-token"]').getAttribute('content');
                // Check for a term
                let getPosts = await fetch('/api/load-posts', {
                    method: 'POST',
                    credentials: 'include', 
                    headers: {
                        'content-type': 'application/json',
                        'X-CSRF-Token': csrf
                    },
                    body: JSON.stringify(jsonBody)
                });
                let response = await getPosts.text();
                if(response.trim() !== "") {
                    try {
                        let newEl = document.createElement('div');
                        newEl.innerHTML = response;
                        document.getElementById('content').innerHTML += newEl.innerHTML;
                        document.getElementById('pagination').innerHTML = `<a href="" class="next-page">View More Articles</a>`
                        skip += limit;
                        fetchingInProgress = false;
                    }
                    catch(e) {
                        console.log(e);
                    }
                } 
                else if(document.querySelector('.no-results') == null) {
                    document.getElementById('pagination').innerHTML = "<div class='no-results'>No More Results!</div>"   
                }
            }
        }
    });
}

if(localStorage.getItem('#subscribe') !== null) {
    document.getElementById('subscribe').remove();
    document.querySelectorAll('.subscribe-button').forEach(function(item) {
        item.remove();
    });
}
if(document.querySelector('#subscribe button') !== null || document.body.getAttribute('data-subscribe') == "true" || document.querySelector('.subscribe-button') !== null) {
    document.querySelectorAll('.subscribe-button').forEach(function(item) {
        item.addEventListener('pointerdown', function(e) {
            if(document.body.getAttribute('data-subscribe') == "true") {
                document.body.setAttribute('data-subscribe', false);
                window.location.hash = '';
            } else {
                document.body.setAttribute('data-subscribe', true);
                window.location.hash = '#subscribe';
            }
        });
    });
    if(document.getElementById('subscribe-box') !== null) {
        let validateEmail = function(email) {
            const regex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
            return regex.test(email);
        }
        let subscribe = async function() {
            let input = document.querySelector('#subscribe-box input[type="text"]').value;
            if(!validateEmail(input)) {
                document.querySelector('#subscribe-box .error-message').classList.add('active');
                setTimeout(function() {
                    document.querySelector('#subscribe-box .error-message').classList.remove('active');
                }, 3000);
            } else {
                let postEmailSubscription = await fetch('/api/subscription/', {
                    method: 'POST',
                    body: JSON.stringify({
                        "email" : input
                    }),
                    headers: {
                        'content-type': 'application/json'
                    }
                });
                let getResponse = await postEmailSubscription.json();
                if(getResponse.success == true) {
                    document.querySelector('#subscribe').classList.add('completed');
                    document.body.setAttribute('data-subscribe', false);
                    window.location.hash = '';
                    localStorage.setItem('#subscribe', input);
                } else {
                    document.querySelector('#subscribe-box .error-message').textContent = 'We ran into an error, try again later';
                    document.querySelector('#subscribe-box .error-message').classList.add('active');
                    setTimeout(function() {
                        document.querySelector('#subscribe-box .error-message').classList.remove('active');
                    }, 3000);
                }
            }
        };
        document.querySelector('#subscribe-box input[type="submit"]').addEventListener('click', function(e) {
            subscribe();
        });
        document.querySelector('#subscribe-box input[type="text"]').addEventListener('keydown', function(e) {
            if(e.keyCode === 13) {
                subscribe();
            }
        });
        document.querySelector('#subscribe-box .close').addEventListener('click', function(e) {
            document.body.setAttribute('data-subscribe', false);
            window.location.hash = '';
        });
        
        if(document.getElementById('main-cover') !== null) {
            document.getElementById('main-cover').addEventListener('pointerdown', function(e) {
                document.body.setAttribute('data-subscribe', false);
                window.location.hash = '';
            });
            document.querySelector('#subscribe-box .close').addEventListener('pointerdown', function(e) {
                document.body.setAttribute('data-subscribe', false);
                window.location.hash = '';
            });
        }
    }
}

if(document.body.classList.contains('series')) {
    document.querySelectorAll('.items .item').forEach(function(item) {
        Object.keys({ ...localStorage }).forEach(function(i) {
            if(i == item.querySelector('a').getAttribute('href')) {
                item.querySelector('.complete').classList.add('item-complete');
            }
        })
        if(item.querySelector('a').getAttribute('data-href'));
    });
    let completeItems = document.querySelectorAll('.items .item-complete').length;
    let allItems = document.querySelectorAll('.items .item').length;
    
    let completeWidth = `${Math.round((completeItems / allItems) * 100)}%`;
    document.getElementById('series-progress-amount').style.width = completeWidth;
    document.getElementById('series-completion-amount').textContent = completeWidth;
}
if(document.body.classList.contains('series-item') || document.body.classList.contains('nav-enabled')) {
    if(document.querySelector('.navigation-item') !== null) {
        document.querySelector('.navigation-item').classList.add('current');
        window.addEventListener('scroll', function(e) {
            let h2List = []
            if(document.getElementById('secondary-navigation') !== null) {
                document.getElementById('secondary-navigation').style.transform = `translateY(${window.scrollY}px)`
            }
            document.querySelectorAll('#content-text h2').forEach(function(item) {
                let findH2 = h2List.find((e) => e.text === item.textContent);
                if(item.getBoundingClientRect().top - 100 < 0) {
                    if(findH2 == null) {
                        h2List.push({ 'text' : item.textContent, 'distance' : item.getBoundingClientRect().top - 100});
                    } else {
                        findH2.distance = item.getBoundingClientRect().top - 100;
                    }
                }
            });
            if(h2List.length === 0 && document.querySelector('#content-text h2') !== null) {
                h2List.push({ 'text' : document.querySelector('#content-text h2').textContent, 'distance' : document.querySelector('#content-text h2').getBoundingClientRect().top - 100});
            }
            
            document.querySelectorAll('.navigation-item').forEach(function(item) {
                item.classList.remove('current');
            });
            document.querySelectorAll('.navigation-item').forEach(function(item) {
                let currentItem = h2List[h2List.length - 1];
                if(typeof currentItem !== "undefined") {
                    let parseText = currentItem.text.split(' #')[0].split(' ').join('-').toLowerCase();
                    if(item.querySelector('a').getAttribute('href') == `#${parseText}`) {
                        item.classList.add('current');
                    }
                }
            });
        });
    }
    let newDiv = document.createElement('div');
    newDiv.setAttribute('class', 'progress-bar');
    newDiv.setAttribute('id', 'article-progress');
    newDiv.innerHTML = '<div class="progress"></div>'
    document.body.appendChild(newDiv);
    
    if(document.querySelector('#secondary-navigation') !== null && document.querySelector('.inline-quiz-link') !== null) {
        document.querySelector('#secondary-navigation').appendChild(document.querySelector('.inline-quiz-link'));
    }
    
    if(localStorage.getItem(window.location.pathname) == "true") {
        document.querySelector('#article-progress .progress').style.width = `calc(100% + 3px)`;
        document.getElementById('article-progress').classList.add('complete');
    } 
    document.querySelectorAll('.navigation-item a').forEach(function(item) {
        item.addEventListener('click', function(e) {
            setTimeout(function() {
                
            }, 100);   
        });
    })
    let calculateScroll = 3;
    let complete = false;
    document.addEventListener('scroll', function(e) {
        let totalHeight = document.getElementById('content').scrollHeight;
        let currentScroll = window.scrollY + 1400;
        if(localStorage.getItem(window.location.pathname) == "true") {
            document.querySelector('#article-progress .progress').style.width = `calc(100% + 3px)`;
            document.getElementById('article-progress').classList.add('complete');
        } else {
            if(complete == false) {
                calculateScroll = (currentScroll / totalHeight) * 100;
                if(calculateScroll >= 100) {
                    complete = true;
                }
                document.querySelector('#article-progress .progress').style.width = `${calculateScroll}%`
            } else {
                document.querySelector('#article-progress .progress').style.width = `calc(100% + 3px)`;
                document.getElementById('article-progress').classList.add('complete');
            }
            if(complete == true) {
                localStorage.setItem(window.location.pathname, true);
            }
        }
    })
}