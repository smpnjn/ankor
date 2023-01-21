/**
 * takes an HTML DOM element, and returns a set of data based on whether its parent(s) match the match param
 * @param {HTMLElement} el - HTML DOM element
 * @param {string} match - The string you want to match the element against
 * @param {object} last - configurable option -> 1: returns only the last element.
 *                                              -1: returns only the last element if it matches `match`.
 *                                               2: returns all parents which match `match`.
 *                                               any other: returns all parents until one matches, then stops.
 */
const parent = function(el, match, last) {
	var result = [];
	for (let p = el && el.parentElement; p; p = p.parentElement) {
        if(last !== 2) {
            result.push(p);
        }
		if(p.matches(match)) {
            if(last === 2) {
                result.push(p)
            }
            else {
                break
            }
		}
	}
	if(last === 1) {
	    return [ result[result.length - 1] ]
	} else if(last === -1) {
        if(result[result.length - 1].matches(match)) {
            return [ result[result.length - 1] ]
        } 
        else {
            return false
        }
    } else {
		return result
	}
}


/**
 * shuffles an array randomly
 * @param {array} array - The array you want to shuffle
 */
const shuffle = (array) => {
    let currentIndex = array.length,  randomIndex;
    // While there remain elements to shuffle.
    while (currentIndex != 0) {

        // Pick a remaining element.
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;

        // And swap it with the current element.
        [array[currentIndex], array[randomIndex]] = [ array[randomIndex], array[currentIndex] ];
    }

    return array;
}


export { parent, shuffle }