# Getting started with StretchFS

There are a couple of programs required to get a fully functional StretchFS
up and running. The installation of these programs is simple and it will be running in no time.

The first program that is needed is Couchbase Server Community edition which
can be found from this URL: https://www.couchbase.com/downloads

This guide is going to focus stretchFS installation on Microsoft Windows.

# Install Couchbase

Run through the Couchbase Server installation package. Once that is completed,
open a web browser and navigate to http://localhost:8091. 

Couchbase will present a preliminary screen that looks similar to this:

          Couchbase Server
     Community Edition 5.0.1 build 5003

The installation will ask if there is to be a new cluster to be set up or to join an existing cluster.

Since this is the first time it will be set up, create a new cluster.  Create the new Couchbase cluster according to the information supplied below:

Cluster Name: 127.0.0.1
Leave admin user as the Administrator username.
Set a password for the Administrator.

On the next page, leave the default settings, click save and then click finish.

# Next, install FFMPEG

FFmpeg is a free software project that produces libraries and programs for handling multimedia data.
For more information:
     https://www.ffmpeg.org/
     https://en.wikipedia.org/wiki/FFmpeg
     
# IMPORTANT: Close any open MS Windows command prompts (cmd.exe) and continue the installation.

Next, FFMPEG will need to be installed in order to process videos. Download FFMPEG for your system and architecture.  To download this, navigate a Web browser to the following URL:
                    http://ffmpeg.zeranoe.com/builds/

  1.  Select the correct build and download FFMPEG by clicking the blue "Download Build" button.
  2.  Open the archive.
  3.  Open the 'ffmpeg-<version>' folder.
  4.  Inside the 'ffmpeg-<version>' folder, copy the 'bin' folder to 'C:\bin'.
  5.  Add the new path to your Windows system path. Open command prompt and type the command:
      
      setx path "%path%;c:\bin

      Your screen will look similar to this:
-------------------------------------------------------------  
 Microsoft Windows [Version 10.0.15063]
 (c) 2017 Microsoft Corporation. All rights reserved.
 
 C:\Users\user> setx path "%path%;c:\bin
 
 SUCCESS: Specified value was saved.
 
 C:\Users\user>
------------------------------------------------------------- 
 
To test the installation of FFMPEG, close any and all open command prompt windows. Once all command prompt windows are closed, open a new command prompt.

Type the following:

ffmpeg -version

If you see a long bit of output starting with `ffmpeg version` and looks like below, FFMPEG has been installed successfully:

configuration: --enable-gpl --enable-version3 . . . .  etc.
libavutil 
libavcodec
libavformat

* Output may vary

If FFMPEG has been installed and all other work has been performed properly, external prerequisites have been satisfied.

# StretchFS

Use GIT to clone StretchFS.  At this time, 'git' must be installed. If the instructions were followed correctly, this should not be a problem.

# Test GIT

You can test git by typing in a command prompt window:  'git --version'.
Output will look similar to this:

  ---------------------------------------------------------
   Microsoft Windows [Version 10.0.15063]
   (c) 2017 Microsoft Corporation. All rights reserved.
   
   C:\Users\user>git --version
   git version 2.16.1.windows.3
   
   C:\Users\user>
  ---------------------------------------------------------

# Now it is time to obtain StretchFS and a runtime Environment.

In a command prompt window, execute the folllowing commands:

  1.  C:
  2.  cd \
  3.  mkdir opt
  4.  cd \opt
  5.  git clone https://github.com/nullivex/stretchfs.git
  6.  cd stretchfs
  7.  npm install

Once these steps have been completed a stretchfs instance has been cloned and the
dependencies have been installed.

Before setting up the database you will need to create a local configuration
file. That looks like the following.

```config.local.js
'use strict';

module.exports = {
  couch: {
    admin: {
      username: 'Administrator',
      password: 'passsword'
    },
    username: 'local',
    password: 'password'
  },
  admin: {
    cookie: {
      secret: 'secret'
    },
    prism: {
      username: 'localhost',
      password: 'bigpassword',
      token: 'changeme'
    }
  }
}
```

Change the couch.admin.password to match the Administrator password created
during the Couchbase setup. Once complete, save the file and close notepad.

Now you are ready to setup your database using the following command.

```
node bin\cbSetup.js
```

Now it is time to create a user to connect your local stretchfs instance. Use
the following command to create your user. Feel free to change the password but
remember to update that password in the `config.local.js` that we created
earlier.

```
node bin\userCreate localhost bigpassword
```

Moving along, it is time to get the stretchfs-sdk installed system wide. We use
this to generate tokens and then work on any client side apps that will be
utilizing your stretchfs instance.

```
npm -g install stretchfs-sdk
```

Now that this is complete we will come back to it after we get our cluster up
and running.

To get the cluster going we need to tell `cluster.json` our cluster layout.

```
notepad cluster.json
```

Once notepad is open paste in the following.

```json
{
  "admin": {"host": "localhost"},
  "prism": [
    {"name": "prism1", "host": "localhost"}
  ],
  "store": [
    {"name": "store1", "host": "127.0.0.11", "root": "data/store1"},
    {"name": "store2", "host": "127.0.0.12", "root": "d:/media/store2"}
  ]
}
```

The data roots can be modified to point the different disks on your system.

Once complete, save this file and close notepad.

Now it is time to start your cluster. The cluster launcher will handle this for
you by consuming the `cluster.json` you just created and setting up an
appropriate cluster to meet your needs.

```
node cluster
```

Now that your cluster is running. It is time to authenticate your user that
we created earlier against the new running cluster. To do this open a new
command prompt and run the following.

```
cd \opt\stretchfs
node node_modules\stretchfs-sdk\bin\stretchfs-keygen -H localhost -u localhost -p bigpassword
```

This request will issue a app authorization against your user that we created.

The response will look like the following.

```
//Login successful please use the token below 
{ token: 'S23bWfrOQR37ixxx', 
  tokenType: 'permanent', 
  expiry: 0, 
  ip: '127.0.0.1', 
  data: {}
}
```

Copy the token to your clipboard and then re-open the `config.local.js`

Paste the token where it says `changeme` save the file close it. Close this
command prompt.

Going back to the command where the cluster is running. Press CTRL + C the 
cluster will begin to stop. Once it has stopped. Start it again by running
`node cluster`

Once the startup is complete. You successfully configured your local StretchFS
instance. The last step is to create a Admin user to login to the StretchFS
interface. To do this you will need to run the following in a new command
prompt.

```
cd \opt\stretchfs
node bin\staff create -e foo@foo.foo -p mypassword -n "My Name"
```

This command will create your staff account and issue a completion notice.
Once that has happened you are finally ready to login to your cluster! To do so
open a web browser and navigate to the following URL.

```
http://localhost:5973
```

Login using the email and password used to create the staff account above.

Now its time to test the cluster out and try some content and get a feel what
StretchFS is all about.

Once you are done familiarizing yourself with the dashboard navigate to
Content -> Files and try uploading any non audio/video file of your liking to
see the functionality with static content. Perhaps, try uploading an image or
a pdf.

Now that your upload has completed. (For now in RC1 you must refresh the page
after uploading.) You can open the file and then download it. Using the download
button.

Next its time to test video uploading. Go back to Content -> Files and upload
your favorite video. After the upload is complete click over to Jobs and refresh
this page to see the job status. Upon job completion navigate back to
Content -> Files and then to the video you just uploaded. Open the video and
there should be a player and a preview image. Playing the video should be
working at this point and utilizing whatever storage configuration you like.

Cheers
