# HeatPace
HeatPace connects to Strava and shows how weather affects your running performance so you can adjust your pacing on hot days.

## Inspiration
I love distance running. When it is hot outside, it can take away some of the fun of running because you have to exert yourself more to achieve the same speed. It also increases your heart rate which is bad when you need to have sessions dedicated to increasing your aerobic base and endurance. So, this requires you to adjust your pace and run slower, but it is very difficult to know just how much slower you have to go due to how often the temperature can vary day to day and hour to hour.

## What it does
My web app allows you to get an accurate prediction of how your performance will change in heat. You are asked to input your planned pace for the day as well as the current temperature. This would not mean much by itself as every runner is unique and at a different cardiovascular level. So, to tailor the information you receive, you are encouraged to connect your Strava account via the Strava API and it will pull your recent run activities. Strava activity data does not consistently include reliable weather or temperature information. To address this, I integrated the OpenWeather API to retrieve temperature data based on the location of each run, allowing me to estimate environmental conditions for every activity. The information you will receive is:
* Heat score (difficulty of conditions)
* Predicted pace adjustment
* Heat sensitivity (performance change per temperature increase)
* Runner type classification
* Interactive visualization of pace vs temperature

## How I built it
I built the frontend using html, css, js, and Netlify. For the backend I used Node.js, Express.js, CORS, node-fetch, dotenv, and Render.

## Challenges I ran into
The biggest challenges were creating the algorithms for each of the output fields and creating the chart.

## Accomplishments that I am proud of
I am proud I not only built a tool that will be useful for my future running endeavors, but also did it by myself (and Claude).
 
## What I learned
I learned a lot about using APIs because I ended up utilizing two. Also I accidentally pushed some commits with my API keys exposed so I had to regenerate them and hide them in a .env file that I then added to .gitignore.

## What's next for HeatPace
I built the tool for myself and my running friends and it does exactly what I wanted it to do. So when I eventually discover new problems the more I run I would love to solve them by hacking and to add those features to HeatPace.
