const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, 'base64').toString('utf8');
const serviceAccount = JSON.parse(decoded);

require("dotenv").config();
const port = process.env.PORT || 4000;
const app = express();

// middle ware //
app.use(cors());
app.use(express.json());

const uri = process.env.DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

//firebase verify key //

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

//verify firebase token //

const verifyFirebaseToken = async (req, res, next) => {
  const authHeader = req.headers?.authorization;
  console.log(authHeader)
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unathorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    console.log("decoded token", decoded);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

//varify token email //

const verifyTokenEmail = (req, res, next) => {
  console.log(req.query.email)
  if (req.query.email !== req.decoded.email) {
    return res.status(403).send({ message: "forbidden access" });
  }
  next();
};

async function run() {
  try {
    const tutorialCollection = client.db("talkademic").collection("tutorials");
    const userCollection = client.db("talkademic").collection("users");
    const bookedTutorCollection = client
      .db("talkademic")
      .collection("booked_tutor");

    // Get tutorials //

    app.get("/tutorials", async (req, res) => {
      // const email = req.query.email;
      const result = await tutorialCollection.find().toArray();
      res.send(result);
    });



   // get my tutorial

    app.get('/tutorialsByEmail', verifyFirebaseToken, verifyTokenEmail, async(req, res)=>{
      const email = req.query.email;
      
      const query = {
        userEmail: email
      }
      const result = await tutorialCollection.find(query).toArray();
      res.send(result);
    })


     //get single tutorial//

    app.get("/tutorials/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tutorialCollection.findOne(query);
      res.send(result);
    });


     // get tutors by category //

    app.get("/find-tutors/:category", async (req, res) => {
      const category = req.params.category;
      const query = {
        language: category,
      };
      const result = await tutorialCollection.find(query).toArray();
      res.send(result);
    });

    // my booked tutors //

    app.get("/booked-tutors", verifyFirebaseToken, verifyTokenEmail, async (req, res) => {
      const email = req.query.email;
      try {
        const mybookedTutors = await bookedTutorCollection
          .find({ bookedUserEmail: email })
          .toArray();

        const tutorialId = mybookedTutors.map(
          (tutors) => new ObjectId(tutors.tutorialId)
        );
        const tutorials = await tutorialCollection
          .find({ _id: { $in: tutorialId } })
          .toArray();
        res.send(tutorials);
      } catch (err) {
        res.status(500).send({ error: "Failed to load bookings" });
      }
    });

     //get users ///

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // post booked tutors //

    app.post("/booked-tutors", async (req, res) => {
      const { tutorialId, bookedUserEmail } = req.body;
      try {
        const result = await bookedTutorCollection.insertOne({
          tutorialId,
          bookedUserEmail,
        });
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Booking failed" });
      }
    });

    //add review //

    app.patch("/tutorials-review", async (req, res) => {
      const { id } = req.body;
      console.log(id);
      const query = { _id: new ObjectId(id) };

      const result = await tutorialCollection.updateOne(query, {
        $inc: { review: 1 },
      });
      res.send(result);
    });

    // delte tutoral //

    app.delete("/my-tutorials/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: new ObjectId(id),
      };
      const result = await tutorialCollection.deleteOne(query);
      res.send(result);
    });

    //update tutorial //

    app.put("/tutorials/:id", async (req, res) => {
      const { id } = req.params;
      const { language, langPhoto, description, price } = req.body;
      const query = { _id: new ObjectId(id) };

      const updateData = {
        $set: {
          language,
          langPhoto,
          description,
          price,
        },
      };
      const result = await tutorialCollection.updateOne(query, updateData);
      res.send(result);
    });

    // search api //

    app.get("/tutorials/search/tutors", async (req, res) => {
      try {
        const query = req.query.que;
        console.log(query);
        const result = await tutorialCollection
          .find({
            $or: [{ language: { $regex: query, $options: "i" } }],
          })
          .toArray();
        res.send(result);
      } catch (err) {
        console.error("Search route error:", err);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", async (req, res) => {
  res.send("Talkademic server running...");
});

app.listen(port, () => {
  console.log("server runnig on the port", port);
});
