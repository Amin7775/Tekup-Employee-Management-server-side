require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.Stripe_Secret_key);
const jwt = require("jsonwebtoken");

// middleware
app.use(cors());
app.use(express.json());
// jwt verify token middleware
const verifyToken = (req, res, next) => {
  if (!req.headers.authorization) {
    return res.status(401).send({ message: "forbidden access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  // console.log(token)
  jwt.verify(token, process.env.Access_Token_Secret, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "forbidden access" });
    }
    req.decoded = decoded;
    // console.log(decoded.email)
    next();
  });
};

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
    const paymentCollection = database.collection("payments");
    const workCollection = database.collection("works");
    const contactUsCollection = database.collection("contactUs");
    // ------ JWT related api ------
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.Access_Token_Secret, {
        expiresIn: "5h",
      });
      res.send({ token });
    });
    // verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      // console.log(user);
      const isAdmin = user?.role === "Admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };
    // verify HR middleware
    const verifyHR = async (req, res, next) => {
      const email = req.decoded?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      // console.log(user);
      const isHR = user?.role === "HR";
      if (!isHR) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // -----user related api-----

    // verify user
    app.get("/user", verifyToken, async (req, res) => {
      const email = req.decoded.email;
      const query = { email: email };
      const result = await userCollection.findOne(query);
      res.send(result);
    });
    // getting all data for employees - both verified / unverified;
    app.get("/users/employees", verifyToken, verifyHR, async (req, res) => {
      const query = { role: { $in: ["Employee", "HR"] } };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });
    // getting single user - Login page - used for checking isFired
    app.get("/users/isFired/:email", async (req, res) => {
      const userEmail = req.params.email;
      const query = { email: userEmail };
      const result = await userCollection.findOne(query);
      res.send(result);
    });
    // getting all data except Admin - For Admin - All Employees page
    app.get("/employees", verifyToken, verifyAdmin, async (req, res) => {
      const query = { role: { $in: ["Employee", "HR"] }, isVerfied: true };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });
    // make employee HR - Admin - All Employees page
    app.patch("/employees/:id", verifyToken, verifyAdmin, async (req, res) => {
      const employeeId = req.params.id;
      const { isHR } = req.body;
      console.log(employeeId, isHR);
      const query = { _id: new ObjectId(employeeId) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: isHR,
        },
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });
    // get single user info - Employee list - HR
    app.get("/users/:id", verifyToken, verifyHR, async (req, res) => {
      const userId = req.params.id;
      // console.log(userId)
      const query = { _id: new ObjectId(userId) };
      const result = await userCollection.findOne(query);
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
      const { isVerfied } = req.body;
      //   console.log(userId,isVerfied);
      const query = { _id: new ObjectId(userId) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          isVerfied: !isVerfied,
        },
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });
    // make employee Fired - Admin - All Employees page
    app.patch(
      "/employees/fire/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const employeeId = req.params.id;
        const { fired } = req.body;
        // console.log(employeeId,fired);
        const query = { _id: new ObjectId(employeeId) };
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            isFired: !fired,
          },
        };
        const result = await userCollection.updateOne(
          query,
          updateDoc,
          options
        );
        res.send(result);
      }
    );
    // update employee salary
    app.patch("/employee/salary/:id", verifyToken, async (req, res) => {
      const employeeId = req.params.id;
      const { newSalary } = req.body;
      const query = { _id: new ObjectId(employeeId) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          salary: newSalary,
        },
      };
      const result = await userCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });

    // ------ Payment Related Apis ------
    // payment intent
    app.post("/create-payment-intent", async (req, res) => {
      const { salary } = req.body;
      const amount = parseInt(salary * 100);
      // console.log(amount)
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const { employeeId, paidFor } = payment;

      const existingPayment = await paymentCollection.findOne({
        paidFor: paidFor,
        employeeId: employeeId,
      });
      // console.log(existingPayment)
      if (existingPayment) {
        return res
          .status(400)
          .send({ message: "Payment for this month/year already exists." });
      }

      const paymentResult = await paymentCollection.insertOne(payment);
      res.send({ paymentResult });
    });
    // payment history - employee
    app.get("/payment-history", verifyToken, async (req, res) => {
      const userEmail = req.decoded?.email;
      // console.log(userEmail)
      const query = { employeeEmail: userEmail };
      const page = parseInt(req.query?.page);

      const sortResult = await paymentCollection
        .find(query)
        .skip(page * 5)
        .limit(5)
        .sort({ paymentYear: -1, monthNumber: -1 })
        .toArray();
      res.send(sortResult);
    });
    // single employee payment history - HR - Employee details page
    app.get("/payment-history/:id", verifyToken, async (req, res) => {
      const employeeId = req.params.id;
      // console.log(employeeId);
      const query = { employeeId: employeeId };
      const result = await paymentCollection
        .find(query)
        .limit(6)
        .sort({ paymentYear: -1, monthNumber: 1 })
        .toArray();
      res.send(result);
    });
    // payment count for pagination
    app.get("/paymentCount", verifyToken, async (req, res) => {
      const userEmail = req.decoded?.email;
      const query = { employeeEmail: userEmail };
      const count = await paymentCollection.countDocuments(query);
      res.send({ count });
    });

    // ---------- work related api ---------
    app.post("/works", verifyToken, async (req, res) => {
      const workInfo = req.body;
      const result = await workCollection.insertOne(workInfo);
      res.send(result);
    });

    app.get("/works", verifyToken, async (req, res) => {
      const userEmail = req.decoded?.email;
      const query = { employeeEmail: userEmail };
      const result = await workCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    // get all work related data - Work Progress - HR
    app.get("/allworks", verifyToken, verifyHR, async (req, res) => {
      const queries = req.query;
      const selectedMonth = parseInt(queries.selectedMonth);
      const selectedName = queries.selectedName;
      // console.log(queries, selectedMonth, selectedName);
      const query = {};
      if (selectedName) query.employeeName = selectedName;
      if (selectedMonth) query.monthOnly = selectedMonth;
      const result = await workCollection
        .find(query)
        .sort({ date: -1 })
        .toArray();
      // console.log(result)
      res.send(result);
    });

    // ---------- Contact Us related Apis ----------

    app.get("/contactUs", verifyToken, verifyAdmin, async (req, res) => {
      const result = await contactUsCollection.find().toArray();
      res.send(result);
    });

    app.post("/contactUs", async (req, res) => {
      const contactUsInfo = req.body;
      const result = await contactUsCollection.insertOne(contactUsInfo);
      res.send(result);
    });

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
