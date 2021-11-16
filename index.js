const express = require('express');
const cors = require('cors')
const { MongoClient } = require('mongodb');
const admin = require("firebase-admin");
const ObjectId = require('mongodb').ObjectId;
const app = express();
require("dotenv").config();
const fileUpload = require('express-fileupload')
const stripe = require("stripe")(process.env.STRIPE_SECRET)
const port = process.env.PORT || 5000;


// JWT token


const serviceAccount = require('./doctors-portal-firebase-adminsdk.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

//Middleware
app.use(cors());
app.use(express.json());
app.use(fileUpload())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xrjhi.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });


async function verifyToken(req, res, next) {
  if (req.headers?.authorization?.startsWith('Bearer ')) {
    const token = req.headers.authorization.split('Bearer ')[1];
    try {
      const decodedUser = await admin.auth().verifyIdToken(token);
      req.decodedEmail = decodedUser.email
    }
    catch {

    }
  }
  next();
}

async function run() {
  try {
    await client.connect();
    const database = client.db("Doctors_Portal");
    const patientCollection = database.collection("Patients_Info");
    const userCollection = database.collection("users");
    const doctorCollection = database.collection("Doctors_Info");


    app.post('/patientinfo', async (req, res) => {
      const patientData = req.body;
      const result = await patientCollection.insertOne(patientData);
      res.send(result.acknowledged)
    });

    app.get('/appoinments', verifyToken, async (req, res) => {
      const email = req.query.email;
        const date = req.query.date;
        const query = { email: email, date: date };
        const cursor = patientCollection.find(query)
        const appoinments = await cursor.toArray();
        res.json(appoinments)
    });

    // Get Payment data
    app.get('/dashboard/payment/:id', async (req, res) => {
      const id = req.params.id;
      const query = {_id:ObjectId(id) };
      const appoinment = await patientCollection.findOne(query)
      res.json(appoinment)
    });


    // Update Payment to paid
    app.put('/appoinments/:id', async (req, res) => {
      const id = req.params.id;
      const payment = req.body;
      const query = {_id:ObjectId(id) };
      const updateDoc ={$set: {payment: payment}}
      const result = await patientCollection.updateOne(query, updateDoc)
      res.json(result)
    });

    // check admin or not
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email }
      const user = await userCollection.findOne(query);
      let isAdmin = false
      if (user?.role === 'Admin') {
        isAdmin = true
      };
      res.json({ admin: isAdmin })
    })


    app.post('/users', async (req, res) => {
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.json(result.acknowledged)
    });


    app.post('/addDoctor', async (req, res) => {
      const name = req.body.name;
      const email = req.body.email;
      const pic = req.files.img;
      const picData = pic.data;
      const encodedPic = picData.toString('base64');
      const imageBuffer = Buffer.from(encodedPic, 'base64');
      const doctor = {
        name: name,
        email:email,
        img:imageBuffer
      }
      const result = await doctorCollection.insertOne(doctor);
      res.json(result.acknowledged)
    });

    app.get('/doctors', async (req,res)=>{
      const doctors = await doctorCollection.find({}).toArray();
      res.json(doctors)
    })

    app.put('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const options = { upsert: true }
      const updateUser = { $set: user };
      const result = await userCollection.updateOne(query, updateUser, options)
      res.send(result.acknowledged)

    });
    app.post('/create-payment-intent', async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      });
      res.json({
        clientSecret: paymentIntent.client_secret
      });
    });

    app.put('/users/admin', verifyToken, async (req, res) => {
      const email = req.body.email;
      const requister = req.decodedEmail;
      if (requister) {
        const requisterAccount = await userCollection.find({ email: requister });
        if (requisterAccount.role === "Admin") {
          const filter = { email: email };
          const updateDoc = { $set: { role: "Admin" } };
          const result = await userCollection.updateOne(filter, updateDoc);
          res.json(result)
        }
      }
      else{
        res.status(403).json({message:"you do not have access to make admin"})
      }

    });
  } finally {
    //   await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('I am now in Doctors Portal Server')
})

app.listen(port, () => {
  console.log(`Doctors Portal listening at port: ${port}`)
})