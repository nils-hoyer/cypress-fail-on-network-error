const fs = require('fs');
const cors = require('cors');
const express = require('express');
const app = express();
const port = 3000;

app.use(cors());

app.get('/', (request, response) => {
    response.send('up');
});

app.get('/test', (request, response) => {
    const { method, status, requests, delay } = request.query;
    if (!method || !status || !requests || !delay)
        return response.status(400).send('validation failed!');

    const html = generateHtml({ method, status, requests, delay });
    response.set('Content-Type', 'text/html').status(200).send(html);
});

app.get('/xhr', (request, response) => {
    const { status, delay } = request.query;
    if (!status || !delay)
        return response.status(400).send('validation failed!');

    setTimeout(() => {
        response
            .set('Content-Type', 'application/json')
            .status(parseInt(status))
            .send();
    }, delay);
});

const generateHtml = ({ method, status, requests, delay }) => {
    return fs
        .readFileSync(__dirname + '/index.html')
        .toString()
        .replaceAll('_method_', method)
        .replaceAll('_status_', status)
        .replaceAll('_requests_', requests)
        .replaceAll('_delay_', delay);
};

const start = () =>
    new Promise((resolve, reject) => {
        const server = app.listen(port, (error) => {
            if (error) return reject(error);
            console.log(`app listening on port ${port}`);
            resolve(server);
        });
    });

if (require.main === module) start();

module.exports = { start };
