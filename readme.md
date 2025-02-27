## Take home test

Welcome! Your task will be to create a UI that visualizes timeseries data.

### Data

The data is a timeseries of 10 million data points. The provided script `generate_data.py` will generate the data for you and output a file called data.csv.

The data is a simple csv file with two columns: `Timestamp` and `Value`. The `Timestamp` column is the number of nanoseconds since the unix epoch and the `Value` column is a numeric value.

### Requirements

The UI should allow the user to pan and zoom in and out through the data interactively.

- You may use any common libraries or frameworks you like to build the UI
- You may also use any libraries or frameworks to help you with the data processing
- You may communicate with a backend using any method you like (ex: REST, websockets, etc.)
- You may use any external services (ex: redis, database, etc.) if they can be easily run in a docker container
- You may do pre-processing of the data into any format you would prefer ahead of time

If anything is unclear please reach out or make reasonable assumptions and document them in your README file.

### Bonus points

- Modify the script and try to handle a larger number of data points (ex: 1 billion)
- Allow the user to upload their own data file
- Stream in data to the UI

### Submission format

Please submit your solution as a zip file or as a github repo containing all the necessary files. If there is any setup required, please include a README file with instructions on how to run your solution.