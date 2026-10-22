/**
 * XSS Sanitization Utility
 * Requirements: CHAT-SR-004, SAD Section 3.7, STP TC-Sec-04
 *
 * Provides server-side sanitization and escaping for message payloads,
 * user inputs, and request parameters to prevent Stored and Reflected XSS.
 */

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#96;',
};

const XSS_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>|<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>|on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)|javascript\s*:/gi;

/**
 * Escape HTML special characters to render content inert
 * @param {string} str - Raw string
 * @returns {string} - Escaped inert string
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"'/`]/g, (match) => HTML_ESCAPE_MAP[match]);
}

/**
 * Remove dangerous executable tags and inline scripts
 * @param {string} str - Raw string
 * @returns {string} - Disarmed string
 */
function stripDangerousTags(str) {
  if (typeof str !== 'string') return '';
  return str.replace(XSS_PATTERN, '');
}

/**
 * Sanitize a chat message content before storage and broadcast.
 * Converts potentially malicious HTML/scripts into inert text.
 * @param {string} content - Raw message text
 * @returns {string} - Safe sanitized message text
 */
function sanitizeMessage(content) {
  if (typeof content !== 'string') return '';
  // Trim and escape HTML entities so <script> renders as inert text
  return escapeHtml(content.trim());
}

/**
 * Recursively sanitize all string properties in an object or array
 * Useful for Express middleware sanitization of request bodies
 * @param {*} data - Request body, query, or params
 * @returns {*} - Sanitized data
 */
function sanitizeDeep(data) {
  if (typeof data === 'string') {
    return sanitizeMessage(data);
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeDeep(item));
  }
  if (data !== null && typeof data === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(data)) {
      sanitized[key] = sanitizeDeep(value);
    }
    return sanitized;
  }
  return data;
}

/**
 * Helper to test if a string contains potentially unsafe XSS payloads
 * @param {string} str - String to test
 * @returns {boolean} - True if unsafe script/event patterns are present
 */
function containsUnsafeMarkup(str) {
  if (typeof str !== 'string') return false;
  return XSS_PATTERN.test(str) || /<[^>]+>/i.test(str);
}

module.exports = {
  escapeHtml,
  stripDangerousTags,
  sanitizeMessage,
  sanitizeDeep,
  containsUnsafeMarkup,
};
