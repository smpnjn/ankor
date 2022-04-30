const quizPage = {
    parents: function(el, match, last, bool) {
        var result = [];
        for (var p = el && el.parentElement; p; p = p.parentElement) {
            result.push(p);
            if(p.matches(match)) {
                break;
            }
        }
        if(last == 1) {
            if(typeof bool == "undefined") {
                return result[result.length - 1];				
            } else {
                if(typeof result[result.length - 1] !== "undefined" && result[result.length - 1].matches(match)) {
                    return true;
                } else {
                    return false;
                }
            }
        } else {
            return result;
        }
    },
    randomId: function(length) {
        var result = [];
        var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        var charactersLength = characters.length;
        for ( var i = 0; i < length; i++ ) {
            result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
        }
       return result.join('');
    },
    createConfetti: function(x, y) {
        let createElement = document.createElement('div');
        createElement.id = 'confetti';
        let makeId = quizPage.randomId(36);
        createElement.setAttribute('data-id', makeId);
        let confettiItems = 20;
        let confettiHTML = '';
        let colors = [ '#2162ff', '#9e21ff', '#21a9ff', '#a9ff21', '#ff2184' ]
        for(var i = 0; i < confettiItems; ++i) {
            let color = Math.floor(Math.random() * (colors.length));
            confettiHTML += `<div class="confetti-item" style="background-color: ${colors[color]};" data-angle="${Math.random()}" data-speed="${Math.random()}"></div>`;
            confettiHTML += `<div class="confetti-item reverse" style="background-color: ${colors[color]};" data-angle="${Math.random()}" data-speed="${Math.random()}"></div>`;
        }
        createElement.style.position = `fixed`;
        createElement.style.top = `${x}px`;
        createElement.style.left = `${y}px`;
        createElement.innerHTML = confettiHTML;
        document.body.appendChild(createElement);

        let gravity =  50; // Fjolt is a high gravity planet
        let maxSpeed = 105000; // Pixels * 1000
        let minSpeed = 65000; // Pixels * 1000
        let t = 0; // Time starts at 0
        let maxAngle = 1500; // Radians * 1000
        let minAngle = 400; // Radians * 1000
        let opacity = 1;
        let rotateAngle = 0;

        let interval = setInterval(function() {
            document.querySelectorAll(`[data-id="${makeId}"] .confetti-item`).forEach(function(item) {
                let modifierX = 1;
                let modifierY = 1;
                if(item.classList.contains('reverse')) {
                    modifierX = -1;
                }
                item.style.opacity = opacity;
                let randomNumber = parseFloat(item.getAttribute('data-angle'));
                let otherRandom = parseFloat(item.getAttribute('data-speed'));
                let newRotateAngle = randomNumber * rotateAngle;
                let angle = (randomNumber * (maxAngle - minAngle) + minAngle) / 1000;
                let speed = (randomNumber * (maxSpeed - minSpeed) + minSpeed) / 1000;
                let realT = t * (parseFloat(item.getAttribute('data-angle')));
                let x = speed * t * Math.cos(angle) + (50 * otherRandom * t);
                let y = speed * t * Math.sin(angle) - (0.5 * gravity * Math.pow(t, 2))  + (50 * otherRandom * t);
                item.style.transform = `translateX(${x * modifierX}px) translateY(${y * -1 * modifierY}px) rotateY(${newRotateAngle}deg) scale(${1})`;
            })
            t += 0.1;
            rotateAngle += 3;
            opacity -= 0.02;
            if(t >= 6) {
                t = 0.1;
                if(document.querySelector(`[data-id="${makeId}"]`) !== null) {
                    document.querySelector(`[data-id="${makeId}"]`).remove();
                }
                clearInterval(interval);
            }
        }, 33.33);
    },    
    quizEvents: (socket) => {
        if(document.getElementById('submit-question') !== null) {
            // Standard event listener
            document.getElementById('submit-question').addEventListener('click', async function(e) {
                document.getElementById('copyright').style.display = 'none';
                let questionId = document.getElementById('container').getAttribute('data-question');
                let canonicalName = window.location.pathname.split('/')[2];

                let getQuestion = {
                    questionId: parseFloat(questionId),
                    canonicalName: canonicalName,
                    quizQuestion: true
                }

                console.log(getQuestion);
                
                socket.send(JSON.stringify(getQuestion));
            });
        }
    },
    runQuiz: function(socket, newData) {
        // We have received a valid quiz question
        if(newData.quizQuestion == true && document.querySelector('#container.moving') == null) {
            // So we need to update various attributes about the HTML
            document.getElementById('quiz-question-holder').innerHTML = `<div id="question">${newData.question}</div>`;
            document.getElementById('container').classList.add('moving');
            document.getElementById('container').setAttribute('data-question', newData.quizQuestionNumber + 1);
            document.getElementById('current-number').textContent = newData.quizQuestionNumber + 1;
            
            // Update the progress bar
            let newWidth = parseFloat(document.getElementById('current-number').textContent) / parseFloat(document.getElementById('total-number').textContent);
            document.getElementById('progress-bar-percentage').style.width = `${newWidth * 100}%`;

            // After everything is done moving
            setTimeout(function() {

                // Remove the moving class
                document.getElementById('container').classList.remove('moving');
                // Remove the associated article if still there
                if(document.getElementById('associated-article') !== null) {
                    document.getElementById('associated-article').classList.add('hidden');
                }
                // Update the initial page div to hold the new question
                document.getElementById('initial-page').innerHTML = document.getElementById('quiz-question-holder').innerHTML;
                document.getElementById('quiz-question-holder').innerHTML = '';

                // Add an on click event to the new options
                document.querySelectorAll('.option').forEach(function(item) {
                    item.addEventListener('click', function(e) {
                        if(!document.getElementById('question').classList.contains('finished')) {
                            document.querySelectorAll('.option').forEach(function(i) {
                                i.classList.remove('current');
                            })
                            this.classList.add('current');
                        }
                    })
                });

                // Add an on click event for submitting an individual question
                if(document.getElementById('submit-individual-question') !== null) {
                    document.getElementById('submit-individual-question').addEventListener('click', function() {
                        // Complete Question checker
                        if(document.getElementById('next-question') !== null) return false;

                        let answerId = null;
                        // Find out the answer and URL
                        if(document.querySelector('.option.current') !== null) {
                            answerId = parseFloat(document.querySelector('.option.current').getAttribute('data-id'));
                        }
                        let canonicalName = window.location.pathname.split('/')[2];
                        // Send to socket
                        socket.send(JSON.stringify({
                            answer: answerId,
                            question: parseFloat(document.getElementById('container').getAttribute('data-question')) - 1,
                            getAnswer: true,
                            canonicalName: canonicalName
                        }));
                    })
                }
            }, 500);
        }
        else if(typeof newData.correctAnswer !== "undefined") {
            // Answer is correct
            if(newData.correctAnswer == true) {
                // Add correct class
                document.getElementById('question').classList.add('correct');
                let submitButton = document.getElementById('submit-individual-question');
                let x = submitButton.getBoundingClientRect().left;
                let y = submitButton.getBoundingClientRect().top;  
                // Display confetti
                quizPage.createConfetti(y + 10, x + 50);  
            } else {
                // Answer is wrong, so alert user
                document.getElementById('question').classList.add('false');
                if(typeof newData.theAnswer == "number") {
                    document.querySelector(`.option[data-id="${newData.theAnswer}"]`).classList.add('this-was-it');
                }
            }
            // Question is now finished, so disable interaction..
            document.getElementById('question').classList.add('finished');
            // Change button to work for next question grab
            if(document.getElementById('submit-individual-question') !== null) {
                document.getElementById('submit-individual-question').setAttribute('id', 'next-question');
            }

            // Check the question Id to display the correct text for 'Next Question'
            let questionId = parseFloat(document.getElementById('container').getAttribute('data-question'));
            // Logic
            if(questionId === parseFloat(document.getElementById('total-number').textContent)) {
                document.getElementById('next-question').innerHTML = '<span>🎉 Complete Quiz</span>';
                document.getElementById('next-question').classList.add('complete-quiz');
            } else {
                document.getElementById('next-question').innerHTML = '<span>Next Question</span>';
            }
            // Add new event to get next question
            document.getElementById('next-question').addEventListener('click', function(e) {
                let canonicalName = window.location.pathname.split('/')[2];

                let getQuestion = {
                    questionId: questionId,
                    canonicalName: canonicalName,
                    quizQuestion: true
                }
                socket.send(JSON.stringify(getQuestion));
            })
        }
        else if(typeof newData.quizEnded !== "undefined" && typeof newData.quizFinalScore == "number" && typeof newData.finishedQuizHTML == "string") {
            document.getElementById('quiz-question-holder').innerHTML = `<div id="question">${newData.finishedQuizHTML}</div>`;
            document.getElementById('container').classList.add('moving', 'move-bar');

            // After everything is done moving
            setTimeout(function() {

                // Remove the moving class
                document.getElementById('container').classList.remove('moving');
                
                // Remove original progress bar
                document.getElementById('progress-bar-holder').remove();

                document.getElementById('container').classList.add('moved');
                // Update the initial page div to hold the new question
                document.getElementById('initial-page').innerHTML = document.getElementById('quiz-question-holder').innerHTML;
                document.getElementById('quiz-question-holder').innerHTML = '';

            }, 500);

            let confetti = 0;
            if(document.querySelectorAll('[data-medal="😱"]').length > 0){
                confetti = 0;
            } else if(document.querySelectorAll('[data-medal="🥉"]').length > 0) {
                confetti = 1;
            } else if(document.querySelectorAll('[data-medal="🥈"]').length > 0) {
                confetti = 3;
            } else if(document.querySelectorAll('[data-medal="🎖"]').length > 0) { 
                confetti = 7;
            }
            
            let i = 0;
            let confettiCoord = []
            while(i < confetti) {
                confettiCoord.push({
                    x: Math.abs(Math.floor(Math.random() * window.innerWidth) - 200),
                    y: Math.abs(Math.floor(Math.random() * window.innerHeight) - 200)
                })
                ++i;
            }
            
            confettiCoord.forEach(function(item) {
                quizPage.createConfetti(item.y, item.x);
            });

            window.localStorage.setItem(`${window.location.pathname}`, newData.quizFinalScore);

        }
    }
}