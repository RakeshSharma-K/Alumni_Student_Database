const {Client}=require('pg')

const con= new Client ({
    host:"localhost", 
    user:"postgres", 
    post:5433,
    password:"123456789",
    database:"Alumini_Student"
})

con.connect().then(()=>console.log("Connected"));