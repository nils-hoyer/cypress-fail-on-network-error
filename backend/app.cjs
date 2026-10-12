const express = require('express');
const app = express();

// a blank page for specs that make their requests from cy.window()
app.get('/', (request, response) => {
    response.set('Content-Type', 'text/html').send('<html></html>');
});

// responds with status after delay ms; status=none closes the connection
// without a response
app.all('/xhr', (request, response) => {
    const { status, delay = 0 } = request.query;
    if (!status) return response.status(400).send('validation failed!');

    setTimeout(() => {
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
        <link rel="stylesheet" href="/resource.css" />
        <script src="/resource.js"></script>
    </head>
    <body>
        <img src="/resource.svg" />
        <script>
            const request = new XMLHttpRequest();
            request.open('GET', '/xhr?status=200');
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

// port 0 listens on a free port; server.address().port says which
const start = (port = 0) =>
    new Promise((resolve, reject) => {
        const server = app.listen(port, (error) => {
            if (error) return reject(error);
            console.log(`app listening on port ${server.address().port}`);
            resolve(server);
        });
    });

if (require.main === module) start(3000);

module.exports = { start };
