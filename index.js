const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const axios = require("axios");


const databasePath = path.join(__dirname, "database.db");


const app = express();
app.use(express.json());


let database = null;

const initializationDatabaseAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });

    
    await database.run(`
      CREATE TABLE IF NOT EXISTS products (
        id INT PRIMARY KEY,
        title TEXT,
        price REAL,
        description TEXT,
        category TEXT,
        image TEXT,
        sold BOOLEAN,
        dateOfSale TEXT
      )
    `);

    app.listen(
      3000,
      console.log("Server is Running on http://localhost:3000/")
    );
  } catch (error) {
    console.log(`Server Error: ${error.message}`);
    process.exit(1);
  }
};

initializationDatabaseAndServer();


async function insertSeedData(seedData) {
  const insertQuery = `
    INSERT INTO products (id, title, price, description, category, image, sold, dateOfSale)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;

  
  await database.run("BEGIN TRANSACTION");

  seedData.forEach(async (data) => {
    const {
      id,
      title,
      price,
      description,
      category,
      image,
      sold,
      dateOfSale,
    } = data;
    const idInt = parseInt(id);
    await database.run(insertQuery, [
      idInt,
      title,
      price,
      description,
      category,
      image,
      sold,
      dateOfSale,
    ]);
  });

  await database.run("COMMIT");
}


app.get("/initialize-database", async (request, response) => {
  try {
    const response = await axios.get(
      "https://s3.amazonaws.com/roxiler.com/product_transaction.json"
    );
    seedData = response.data;
    await insertSeedData(seedData);
    response.json({ message: "Database initialized with seed data." });
  } catch (error) {
    response.status(400).json({ error: "Failed to initialize the database." });
  }
});


const validMonths = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function validateMonth(req, res, next) {
  const { month } = req.query;
  if (!month || !validMonths.includes(month)) {
    res
      .status(400)
      .json({
        error:
          "Invalid month. Please provide a valid month between January to December.",
      });
  } else {
    next();
  }
}


app.get("/statistics", validateMonth, async (req, res) => {
  try {
    const { month } = req.query;

  
    const monthNumber = (validMonths.indexOf(month) + 1)
      .toString()
      .padStart(2, "0");

    const queryTotalSaleAmount = `
      SELECT SUM(price) AS totalSaleAmount
      FROM products
      WHERE strftime('%m', dateOfSale) = ?
    `;
    const queryTotalSoldItems = `
      SELECT COUNT(*) AS totalSoldItems
      FROM products
      WHERE strftime('%m', dateOfSale) = ? AND sold = 1
    `;
    const queryTotalNotSoldItems = `
      SELECT COUNT(*) AS totalNotSoldItems
      FROM products
      WHERE strftime('%m', dateOfSale) = ? AND sold = 0
    `;

    const resultTotalSaleAmount = await database.get(queryTotalSaleAmount, [
      monthNumber,
    ]);
    const resultTotalSoldItems = await database.get(queryTotalSoldItems, [
      monthNumber,
    ]);
    const resultTotalNotSoldItems = await database.get(queryTotalNotSoldItems, [
      monthNumber,
    ]);

    const totalSaleAmount = resultTotalSaleAmount.totalSaleAmount || 0;
    const totalSoldItems = resultTotalSoldItems.totalSoldItems || 0;
    const totalNotSoldItems = resultTotalNotSoldItems.totalNotSoldItems || 0;

    res.json({ totalSaleAmount, totalSoldItems, totalNotSoldItems });
  } catch (error) {
    res.status(400).json({ error: "Error fetching statistics." });
  }
});


app.get("/bar-chart", validateMonth, async (req, res) => {
  try {
    const { month } = req.query;

   
    const monthNumber = (validMonths.indexOf(month) + 1)
      .toString()
      .padStart(2, "0");

    const queryBarChart = `
      SELECT
        CASE
          WHEN price >= 0 AND price <= 100 THEN '0 - 100'
          WHEN price > 100 AND price <= 200 THEN '101 - 200'
          WHEN price > 200 AND price <= 300 THEN '201 - 300'
          WHEN price > 300 AND price <= 400 THEN '301 - 400'
          WHEN price > 400 AND price <= 500 THEN '401 - 500'
          WHEN price > 500 AND price <= 600 THEN '501 - 600'
          WHEN price > 600 AND price <= 700 THEN '601 - 700'
          WHEN price > 700 AND price <= 800 THEN '701 - 800'
          WHEN price > 800 AND price <= 900 THEN '801 - 900'
          WHEN price > 900 THEN '901-above'
        END AS priceRange,
        COUNT(*) AS itemCount
      FROM products
      WHERE strftime('%m', dateOfSale) = ?
      GROUP BY priceRange
    `;

    const result = await database.all(queryBarChart, [monthNumber]);

    const barChartData = result.map((row) => ({
      priceRange: row.priceRange,
      itemCount: row.itemCount,
    }));

    res.json(barChartData);
  } catch (error) {
    res.status(400).json({ error: "Error fetching bar chart data." });
  }
});


app.get("/pie-chart", validateMonth, async (req, res) => {
  try {
    const { month } = req.query;

   
    const monthNumber = (validMonths.indexOf(month) + 1)
      .toString()
      .padStart(2, "0");

    const queryPieChart = `
      SELECT category, COUNT(*) AS itemCount
      FROM products
      WHERE strftime('%m', dateOfSale) = ?
      GROUP BY category
    `;

    const result = await database.all(queryPieChart, [monthNumber]);

    const pieChartData = result.map((row) => ({
      category: row.category,
      itemCount: row.itemCount,
    }));

    res.json(pieChartData);
  } catch (error) {
    res.status(400).json({ error: "Error fetching pie chart data." });
  }
});


app.get("/combined-data", validateMonth, async (req, res) => {
  try {
    const { month } = req.query;

    
    const monthNumber = (validMonths.indexOf(month) + 1)
      .toString()
      .padStart(2, "0");

    
    const statisticsURL = `http://localhost:3000/statistics?month=${month}`;
    const barChartURL = `http://localhost:3000/bar-chart?month=${month}`;
    const pieChartURL = `http://localhost:3000/pie-chart?month=${month}`;

    const [
      statisticsResponse,
      barChartResponse,
      pieChartResponse,
    ] = await Promise.all([
      axios.get(statisticsURL),
      axios.get(barChartURL),
      axios.get(pieChartURL),
    ]);

   
    const statisticsData = statisticsResponse.data;
    const barChartData = barChartResponse.data;
    const pieChartData = pieChartResponse.data;

   
    const combinedData = {
      statistics: statisticsData,
      barChart: barChartData,
      pieChart: pieChartData,
    };

    res.json(combinedData);
  } catch (error) {
    res.status(400).json({ error: "Error fetching combined data." });
  }
});
