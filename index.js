const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const admin = require("firebase-admin");
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
// console.log(decoded);
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
  // console.log(authHeader);
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({ message: "unathorized access" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    // console.log("decoded token", decoded);
    req.decoded = decoded;
    next();
  } catch (error) {
    return res.status(401).send({ message: "unauthorized access" });
  }
};

// verify firebase token from body //

const verifyFirebaseTokenFromBody = async (req, res, next) => {
  const authBody = req.body?.accessToken;
  next();
};

//varify token email //

const verifyTokenEmail = (req, res, next) => {
  // console.log(req.query.email);
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
    const tutorApplicationsCollection = client
      .db("talkademic")
      .collection("tutorApplication");
    const blogsCollection = client.db("talkademic").collection("blogs");

    // Get tutorials //

    app.get("/tutorials", async (req, res) => {
      // const email = req.query.email;
      const result = await tutorialCollection.find().toArray();
      res.send(result);
    });

    // get my tutorial

    app.get(
      "/tutorialsByEmail",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;

        const query = {
          userEmail: email,
        };
        const result = await tutorialCollection.find(query).toArray();
        res.send(result);
      }
    );

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

    app.get(
      "/booked-tutors",
      verifyFirebaseToken,
      verifyTokenEmail,
      async (req, res) => {
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
      }
    );

    //get users ///

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // post tuturial //

    app.post("/tutorials", verifyFirebaseTokenFromBody, async (req, res) => {
      const tutorials = req.body;
      tutorials.review = Number(tutorials.review) || 0;
      const result = await tutorialCollection.insertOne(tutorials);
      res.status(201).send(result);
    });

    // post users //

    app.post("/users", async (req, res) => {
      const users = req.body;
      const result = await userCollection.insertOne(users);
      res.status(201).send(result);
    });

    // post api for google login

    app.post("/google-user", async (req, res) => {
      try {
        const user = req.body; // { name, email, photo, ... }

        if (!user.email) {
          return res.status(400).send({ error: "Email is required" });
        }

        // Check if user already exists
        const existingUser = await userCollection.findOne({
          email: user.email,
        });

        if (existingUser) {
          // Already exists → return existing user
          return res.status(200).send({
            message: "User already exists",
            user: existingUser,
          });
        }

        // If not found → insert new user
        const result = await userCollection.insertOne(user);
        res.status(201).send({
          message: "User created successfully",
          result,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Internal server error" });
      }
    });

    // get api for user

    // Get all users
    app.get("/users", async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // Update user role to tutor
    app.patch("/users/:id/role", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body; // role can be "tutor" or "user"

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role: role } }
        );

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to update user role" });
      }
    });

    // Get a user's role by email
    app.get("/users/:email/role", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email: email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        res.send({ role: user.role || "user" });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch user role" });
      }
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
      // console.log(id);
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
        // console.log(query);
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

    // apply for tutor

    app.post("/tutor-applications", async (req, res) => {
      try {
        const application = req.body;
        application.status = "pending";
        application.created_at = new Date().toISOString();

        const result = await tutorApplicationsCollection.insertOne(application);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: error.message });
      }
    });

    // GET /tutor-applications?status=pending
    app.get("/tutor-applications", async (req, res) => {
      try {
        const statusFilter = req.query.status || "pending";
        const tutors = await tutorApplicationsCollection
          .find({ status: statusFilter })
          .toArray();
        res.send(tutors);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Failed to fetch tutor applications" });
      }
    });

    /// PATCH /tutor-applications/:id/status
    app.patch("/tutor-applications/:id/status", async (req, res) => {
      try {
        const id = req.params.id;
        const { status, email } = req.body; // status: "approved" or "rejected"
        if (!status || !["approved", "rejected"].includes(status)) {
          return res.status(400).send({ error: "Invalid status value" });
        }
        const filter = { _id: new ObjectId(id) };
        const updateDoc = { $set: { status } };
        const result = await tutorApplicationsCollection.updateOne(
          filter,
          updateDoc
        );

        // **New code to update the user role if status is approved**
        if (status === "approved") {
          // Find user by email and update role to "tutor"
          const userUpdateResult = await userCollection.updateOne(
            { email: email },
            { $set: { role: "tutor" } }
          );
          // Optionally, you can check if userUpdateResult.modifiedCount === 1
        }

        res.send(result);
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ error: "Failed to update tutor application status" });
      }
    });

    // blgs api

    app.get("/blogs", async (req, res) => {
      try {
        const blogs = await blogsCollection.find({}).toArray();
        res.status(200).send(blogs);
      } catch (error) {
        console.error("Error fetching blogs:", error);
        res.status(500).send({ message: "Failed to fetch blogs" });
      }
    });

    // get single blog 

    app.get("/blogs/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const blog = await blogsCollection.findOne({ _id: new ObjectId(id) });
        if (!blog) {
          return res.status(404).send({ message: "Blog not found" });
        }
        res.send(blog);
      } catch (error) {
        console.error("Error fetching blog by ID:", error);
        res.status(500).send({ message: "Internal server error" });
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
