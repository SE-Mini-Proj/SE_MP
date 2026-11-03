const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const config = require('../config');

const EMPTY_SHA256 = crypto.createHash('sha256').update('').digest('hex');

function createStorageError(message) {
  const error = new Error(message);
  error.status = 502;
  error.code = 'OBJECT_STORAGE_ERROR';
  return error;
}

function getStorageConfig() {
  const storage = config.objectStorage;

  if (!storage.bucket) {
    const error = new Error('Object storage is not configured');
    error.status = 503;
    error.code = 'OBJECT_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  if (!storage.accessKeyId || !storage.secretAccessKey) {
    const error = new Error('Object storage credentials are not configured');
    error.status = 503;
    error.code = 'OBJECT_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  return storage;
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (character) => (
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  ));
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function createSignedRequest(method, key, payloadHash, contentType) {
  const storage = getStorageConfig();
  let endpoint;
  try {
    endpoint = new URL(
      storage.endpoint || `https://s3.${storage.region}.amazonaws.com`
    );
  } catch {
    const error = new Error('Object storage endpoint is invalid');
    error.status = 503;
    error.code = 'OBJECT_STORAGE_NOT_CONFIGURED';
    throw error;
  }
  if (
    !['http:', 'https:'].includes(endpoint.protocol)
    || endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
  ) {
    const error = new Error('Object storage endpoint must be an HTTP(S) URL without credentials or query');
    error.status = 503;
    error.code = 'OBJECT_STORAGE_NOT_CONFIGURED';
    throw error;
  }

  const keyPath = key.split('/').map(encodePathSegment).join('/');
  const endpointPath = endpoint.pathname.replace(/\/+$/, '');
  if (storage.forcePathStyle) {
    endpoint.pathname = `${endpointPath}/${encodePathSegment(storage.bucket)}/${keyPath}`;
  } else {
    endpoint.hostname = `${storage.bucket}.${endpoint.hostname}`;
    endpoint.pathname = `${endpointPath}/${keyPath}`;
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const headers = {
    host: endpoint.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  if (storage.sessionToken) headers['x-amz-security-token'] = storage.sessionToken;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name].trim().replace(/\s+/g, ' ')}`)
    .join('\n');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [
    method,
    endpoint.pathname,
    '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');
  const scope = `${dateStamp}/${storage.region}/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
  ].join('\n');
  const dateKey = hmac(`AWS4${storage.secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, storage.region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');

  headers.Authorization = [
    'AWS4-HMAC-SHA256',
    `Credential=${storage.accessKeyId}/${scope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signature}`,
  ].join(' ');

  return { endpoint, headers };
}

function sendRequest(method, key, body = null, contentType = null) {
  const payloadHash = body
    ? crypto.createHash('sha256').update(body).digest('hex')
    : EMPTY_SHA256;
  const { endpoint, headers } = createSignedRequest(
    method,
    key,
    payloadHash,
    contentType
  );
  if (body) headers['content-length'] = body.length;

  const transport = endpoint.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(endpoint, {
      method,
      headers,
    }, (response) => {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume();
        reject(createStorageError(
          `Object storage returned HTTP ${response.statusCode}`
        ));
        return;
      }

      resolve(response);
    });

    request.on('error', () => reject(createStorageError('Object storage request failed')));
    if (body) request.end(body);
    else request.end();
  });
}

async function putObject({ key, body, contentType }) {
  const response = await sendRequest('PUT', key, body, contentType);
  response.resume();
}

async function getObject({ key }) {
  return sendRequest('GET', key);
}

async function deleteObject({ key }) {
  const response = await sendRequest('DELETE', key);
  response.resume();
}

module.exports = {
  putObject,
  getObject,
  deleteObject,
};
