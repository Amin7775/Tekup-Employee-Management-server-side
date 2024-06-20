require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.Stripe_Secret_key);

// middleware
app.use(cors());
app.use(express.json());

// db

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_User}:${process.env.DB_Password}@clusterpherob9.3leb5bl.mongodb.net/?retryWrites=true&w=majority&appName=ClusterPheroB9`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // collections
    const database = client.db("tekup");
    const userCollection = database.collection("users");
    const paymentCollection = database.collection("payments")

    // -----user related api-----

    // getting all data
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
    // post
    app.post("/users", async (req, res) => {
      const userInfo = req.body;
      const query = { email: userInfo.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "user already exists" });
      }
      const result = await userCollection.insertOne(userInfo);
      res.send(result);
    });
    // update single user isVerify data
    app.patch("/users/:id", async (req, res) => {
      const userId = req.params.id;
      const {isVerfied} = req.body;
    //   console.log(userId,isVerfied);
      const query = { _id: new ObjectId(userId) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          isVerfied: !isVerfied,
        },
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result)
    });


    // ------ Payment Related Apis ------
    // payment intent
    app.post('/create-payment-intent', async(req,res)=>{
      const {salary} = req.body;
      const amount = parseInt(salary * 100)
      // console.log(amount)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payments', async(req,res)=>{
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment)
      res.send({paymentResult})
    })

    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// root api
app.get("/", (req, res) => {
  res.send("Tekup server is running");
});

app.listen(port, () => {
  console.log("Tekup server is running on port: ", port);
});
