# google-photos-album-scraper

like the name says, this is a simple scraper for google photos albums that pushes each image to a Supabase storage pool and database.

## Usage

1. clone the repo
2. run `npm install`
3. create a `.env` file in the root directory (or add to your environment variables) with the following content:
   ```
   GOOGLE_PHOTOS_ALBUM_URL=
   SUPABASE_INSTANCE_URL=
   SUPABASE_SECRET_KEY=
   SUPABASE_DB_NAME=
   SUPABASE_POOL_NAME=
   DEBUG=false
   ```
4. start the scraper with `node .`
5. the scraper will start scraping the album and pushing images (and its metadata) to Supabase.

### Database Setup

1. create a new project on [Supabase](https://supabase.com/)
2. create a new database table with the following schema:
   - id: int8 (primary, unique, identity)
   - link: text (unique)
   - image: text (unique)
   - width: int2
   - height: int2
   - addedTimestamp: int8
   - takenTimestamp: int8
   - description: text (default value: 'untitled')
   - make: text (default value: 'Unknown')
   - model: text (default value: 'Camera')
   - lens: text (nullable)
   - aperture: float4 (nullable)
   - shutterSpeed: float4 (nullable)
   - focalLength: float4 (nullable)
   - iso: float4 (nullable)
3. set up your RLS policies to your liking (or disable RLS for testing purposes)
4. add the name of the database to `SUPABASE_DB_NAME` in the `.env` file

### Storage Setup

1. create a new storage pool in the same Supabase project
2. set up your RLS policies to your liking (or disable RLS for testing purposes)
3. set the name of the storage pool to `SUPABASE_POOL_NAME` in the `.env` file

> [!TIP]
> Set up a cron job to run the scraper at regular intervals. You can do this with Task Scheduler on Windows, cron on Linux, or launchd on macOS.

## License

licensed under the MIT License

## Credits

thanks copilot for writing this readme i got really lazy
