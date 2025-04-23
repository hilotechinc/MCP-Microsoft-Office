/**
 * @fileoverview Message component for rendering a single chat message.
 * Modular, testable vanilla JS function.
 */

/**
 * Create a DOM element for a message.
 * @param {string} sender - The sender's name
 * @param {string} text - The message text
 * @returns {HTMLElement} Message DOM element
 */
export function Message(sender, text) {
    const msg = document.createElement('div');
    msg.className = 'message';
    msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
    return msg;
}
