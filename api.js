// Imports
import express from 'express';
import fetch from 'node-fetch'
import cors from 'cors';

// Variables declaration
const modelToken = "TM:kz7xck6af35w";
const PORT = 8000;
let audioLink = "";

// Express.js setup
const app = express();
app.use(express.json());
app.use(cors());


// Generate uuid and post request we'll send to the FakeYou API
function generateGuid() {
  var result, i, j;
  result = '';
  for(j=0; j<32; j++) {
    if( j == 8 || j == 12 || j == 16 || j == 20)
      result = result + '-';
    i = Math.floor(Math.random()*16).toString(16).toUpperCase();
    result = result + i;
  }
  return result;
}

// Header for the request when getting the inference token
let postRequest = {
  "tts_model_token": modelToken,
  "uuid_idempotency_token": "",
  "inference_text": ""
};


// Get the inference token from the FakeYou API
async function getInferenceToken() {
  try {
    postRequest.uuid_idempotency_token = generateGuid();
    const resp = await fetch("https://api.fakeyou.com/tts/inference", {
      method: 'POST',
      body: JSON.stringify(postRequest),
      headers: {'Content-Type':'application/json'}
    })
    const data = await resp.json()
    return data

  } catch (error) {
    console.log("err inference", error)
  }
  
}

// Fetch every 3s during the poll request for the FakeYou API
async function fetchPatiently(url, params) {
  let response = await fetch(url, params);

  while (response.status === 408 || response.status === 502) {
      // Wait three seconds between each new request
      await new Promise(res => setTimeout(res, 3000));
      response = await fetch(url, params);
  }

  return response;
}

// Poll request for the FakeYou API
function pollRequest(token) {
  console.log("Polling...")
  return new Promise(async(resolve, reject) => {

      // Wait one second between each poll request
      await new Promise(res => setTimeout(res, 1000));

      // Retrieve status of current speech request
      console.log('Fetching...')
      const response = await fetchPatiently(`https://api.fakeyou.com/tts/job/${token}`, {
          method: "GET",
          headers: {
              // "Authorization": fakeYouToken,
              "Accept": "application/json"
          }
      }).catch(error => {
          reject(`HTTP error! ${error.name}`);
          console.error(error);
  })
 
  // Parse JSON to JS object and checks for any error
  const json = await response.json().catch(error => {
    console.log(json);
    reject("Failed to parse poll JSON")
  });

  if (!json) return;

  if (!json.success) {
    reject(`Failed poling! ${json.error_reason}`)
    console.error("jason",json);
    return 
  }

  // Checks for the status of the JSON parse and, if successful, assigns the audio link with the correct info
  switch (json.state.status) {
    case "pending":{
      console.log("STATUS: Pending...")
    }
    case "started":{
      console.log("STATUS: Started...")
    }
    case "attempt_failed":{
      console.log("STATUS: Failed (trying again...)")
      await pollRequest(token).then(resolve).catch(reject);
    }
    case "complete_success":{
      console.log("STATUS: Done!")
      audioLink = `https://storage.googleapis.com/vocodes-public${json.state.maybe_public_bucket_wav_audio_path}`;
      break;
    }
    default:
      console.log("Big error, exiting for the best.");
      break;
  }
})}

// API call to get a random joke from the JokeAPI
async function getJoke(jokeCategory) {
  if (jokeCategory === "Joke Category") {
    jokeCategory = "Any";
  }
  try {
    const resp = await fetch(`https://v2.jokeapi.dev/joke/${jokeCategory}?format=json&type=twopart`)
    const data = await resp.json()
    setUpJoke(data)
  } catch (error) {
    console.log("err inference", error)
  }
}

// Set up the joke string for the get inference token call
const setUpJoke = (res) => {
  console.log(res.type)
  // We send the joke as the inference text to the FakeYou API
  postRequest.inference_text = res.setup + "..........*" + res.delivery;

  // We call the getInferenceToken function
  getInferenceToken()
  .then(res => pollRequest(res.inference_job_token))
  .catch(err => console.log(err))
}


// Express route to get the joke and the audio link from the FrontEnd
app.get("/getjoke", (req, res) => {
  console.log(req.headers.jokecategory)
  console.time("time")
  async function gatherJSONResponse() { 
    await getJoke(req.headers.jokecategory)
    .then(async()=> {
    while (audioLink==="") {
      console.log("Audio link is empty 👁  👁")
      await new Promise(res => setTimeout(res, 1000));
    } 
    })
    .then(()=>res.send(JSON.stringify({"joke":postRequest.inference_text, "audio":audioLink})))
    .then(audioLink = "")
    console.timeEnd("time")
   
    }
    
    gatherJSONResponse();
})


// Function that states the port we're listening to
app.listen(PORT, () => {
  console.log(`App is running on port ${PORT}`)
})
