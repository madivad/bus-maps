# BusMap

A tool for visualizing bus routes on a map.

## Setup

### API's and Static Files

You will need two API keys, one for the buses, their time tables, routes, agents, etc. And one for google maps.

1. Get an API key for NSW Transport:  
        https://opendata.transport.nsw.gov.au/data/dataset/  
        Sign up (no cost) and get an API key here, you can also download the large static files from here as well  
        BUS_URL = https://opendata.transport.nsw.gov.au/data/user/<YOUR-USER>/api-tokens  
        https://opendata.transport.nsw.gov.au/dataset/trip-planner-apis  
        The large static files can be downloaded form here:  
        https://opendata.transport.nsw.gov.au/data/dataset/timetables-complete-gtfs  



2. Get an API key for google maps:
        Do this in the Google API Console
        https://console.cloud.google.com/apis/dashboard

## Usage

It's a flask web server in python, it pulls fixed maps from my local operator (editable in app.py).

Nothing fancy yet
