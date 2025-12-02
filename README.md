# google-photos-album-scraper

like the name says, this is a simple scraper for google photos albums that returns all images as json

## Usage

1. clone the repo
2. run `npm install`
3. create a `.env` file in the root directory (or add to your environment variables) with the following content:
   ```
   PORT=8080
   API_KEY=your_api_key_here
   CACHE_TTL_MS=259200000
   ```
4. start the server with `npm start`
5. access the scraper via `http://localhost:8080/scrape?url=YOUR_ALBUM_URL`, and pass your API key in the `x-api-key` header

## API

- `GET /scrape?url=ALBUM_URL`: scrapes the provided Google Photos album URL and returns a JSON array of image URLs.
  - headers:
    - `x-api-key`: your API key as specified in the `.env` file.
  - response:
    - `200 OK`: returns a JSON array of image URLs.
    - `400 Bad Request`: if the URL parameter is missing or invalid.
    - `401 Unauthorized`: if the API key is missing or incorrect.
    - `500 Internal Server Error`: if an error occurs during scraping.

## Schema

each item in the returned JSON array has the following structure:

```json
{
  "link": "string", // low resolution link to the image. to obtain the original, simply append `=s0-d-ip` to the url
  "width": number, // width of the image in pixels
  "height": number, // height of the image in pixels
  "takenTimestamp": number, // timestamp when the photo was taken (in unix epoch, milliseconds)
  "addedTimestamp": number, // timestamp when the photo was added to the album (in unix epoch, milliseconds)
  "description": "string", // description/caption of the image
  "make": "string", // camera make
  "model": "string", // camera model
  "lens": "string", // lens model
  "focal_length": number, // focal length in mm
  "aperture": number, // aperture value
  "iso": number, // ISO value
  "shutter_speed": number // shutter speed in seconds
}
```

## Caching

responses are cached for a duration specified by `CACHE_TTL_MS` in the `.env` file (default is 3 days).

subsequent requests for the same album URL within this period will return the cached results.

## License

licensed under the MIT License

## Credits

thanks copilot for writing this readme i got really lazy
