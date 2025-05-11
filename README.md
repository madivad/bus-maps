# BusMap

A tool for visualizing bus routes on a map.

## Setup

### API's and Static Files

You will need two API keys, one for the buses, their time tables, routes, agents, etc. And one for google maps.

1. Get an API key for NSW Transport:  
        Sign up (no cost) and get an API key here, you can also download the large static files from here as well  
        The large static files can be downloaded form here:  

        https://opendata.transport.nsw.gov.au/dataset/trip-planner-apis  
        https://opendata.transport.nsw.gov.au/data/dataset/  
        https://opendata.transport.nsw.gov.au/data/user/YOUR-USER-NAME/api-tokens

        At the moment, you'll also need to download the static files from:  
        https://opendata.transport.nsw.gov.au/data/dataset/timetables-complete-gtfs  
        This is about 325MB, unzipped it is over a GB, and has files YOU DON'T want to sync with github! I should include the whole directory, I probably will later. I would like my script to determine if you have the files and it just downloads it, but only if you have an API key (not yet implemented).


3. Get an API key for google maps:
        Do this in the Google API Console
        https://console.cloud.google.com/apis/dashboard

## Usage

It's a flask web server in python, it pulls fixed maps from my local operator (editable in app.py).

Nothing fancy yet
