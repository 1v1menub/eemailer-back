const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres',
  password: '2435',
  port: '5432',
});

app.use(express.json());

const corsOptions = {
  origin: 'http://localhost:5173',
  optionsSuccessStatus: 200,
  credentials: true
};

app.use(cors(corsOptions));

const clients = {};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('register', async (data) => {
    const { user_email } = data;
    clients[user_email] = socket.id;
    try {
      const result = await pool.query('SELECT * FROM users WHERE user_email = $1', [user_email]);
      if (result.rows.length > 0) {
        socket.emit('account_found', result.rows[0]);
      } else {
        socket.emit('account_not_found', { message: 'Account not found. Please create a key pair and send the public key.' });
      }
    } catch (err) {
      console.error(err);
      socket.emit('error', { message: 'Internal server error' });
    }
  });

  socket.on('create_account', async (data) => {
    const { user_email, public_key } = data;
    try {
      await pool.query('INSERT INTO users (user_email, public_key) VALUES ($1, $2)', [user_email, public_key]);
      socket.emit('account_created', { message: 'Account created successfully' });

      const clientId = clients[user_email];
      if (clientId) {
        io.to(clientId).emit('welcome', { message: 'Your account has been created and you are now connected!' });
      }
    } catch (err) {
      console.error(err);
      socket.emit('error', { message: 'Internal server error' });
    }
  });

  socket.on('email_sent', async (data) => {
    const { recipient, sender } = data;
    const clientId = clients[recipient];
    if (clientId) {
      try {
        const result = await pool.query('SELECT user_email FROM users WHERE user_email = $1', [recipient]);
        if (result.rows.length > 0) {
          io.to(clientId).emit('email_notification', { sender });
          console.log(`Email notification sent to ${recipient} (socket id: ${clientId}) from ${sender}`);
        } else {
          console.log(`Recipient ${recipient} not found in the database`);
        }
      } catch (err) {
        console.error(err);
      }
    } else {
      console.log(`No active session found for ${recipient}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    for (const email in clients) {
      if (clients[email] === socket.id) {
        delete clients[email];
        break;
      }
    }
  });
});

app.get('/api/addresses', async (req, res) => {
  try {
    const result = await pool.query('SELECT user_email, public_key FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

server.listen(port, () => {
  console.log(`Server is listening on http://localhost:${port}`);
});
