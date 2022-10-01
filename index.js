const cors = require('cors');
const express = require('express');
const app = express();
const port = 3000;

app.use(cors());

app.listen(port, () => {
    console.log(`app listening on port ${port}`);
});

app.get('/testStatusCode/:statusCode', (req, res) => {
    const { statusCode } = req.params;

    res.set('Content-Type', 'text/html');
    res.status(200);
    res.send(generateHtml(statusCode));
});

app.get('/statusCode/:statusCode', (req, res) => {
    const { statusCode } = req.params;
    res.status(statusCode);
    res.send(statusCode);
});

app.get('/', (req, res) => {
    res.send('up');
});

const generateHtml = (statusCode) => `
<html>
    <head>
        <script>
            const xhttp = new XMLHttpRequest();
            xhttp.open('GET', 'http://127.0.0.1:3000/statusCode/${statusCode}');
            xhttp.send();
        </script>
    </head>
</html>
`;
