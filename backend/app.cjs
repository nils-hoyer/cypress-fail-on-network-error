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
        // status=none closes the connection without a response
        if (status === 'none') return request.socket.destroy();
        response
            .set('Content-Type', 'application/json')
            .status(parseInt(status))
            .send();
    }, delay);
});

// a page that loads a script, a stylesheet and an image, and makes one XHR
app.get('/resources', (request, response) => {
    response.set('Content-Type', 'text/html').send(`<html>
    <head>
        <link rel="stylesheet" href="http://127.0.0.1:3000/resource.css" />
        <script src="http://127.0.0.1:3000/resource.js"></script>
    </head>
    <body>
        <img src="http://127.0.0.1:3000/resource.svg" />
        <script>
            const request = new XMLHttpRequest();
            request.open('GET', 'http://127.0.0.1:3000/xhr/?status=200&delay=0');
            request.send();
        </script>
    </body>
</html>`);
});

app.get('/resource.css', (request, response) => {
    response.set('Content-Type', 'text/css').send('body { margin: 0; }');
});

app.get('/resource.js', (request, response) => {
    response
        .set('Content-Type', 'text/javascript')
        .send('window.loaded = true;');
});

app.get('/resource.svg', (request, response) => {
    response
        .set('Content-Type', 'image/svg+xml')
        .send('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
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
