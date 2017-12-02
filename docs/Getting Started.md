## Getting started with StretchFS

There are a couple of programs required to get a fully functional StretchFS
up and running. However the installation of these programs is simple and
you will be up and running in no time.

The first program that is needed is Couchbase Server Community edition which
can be found from this URL: https://www.couchbase.com/downloads

This guide is going to focus on installation via Windows.

### Install Couchbase

Run through the Couchbase Server installation package. Once that is completed
open your web browser and navigate to http://localhost:8091. On the following
pages complete the setup of your cluster.

Cluster Name: 127.0.0.1
Leave admin user as Administrator
Create a password for the Administrator
Leave the defaults on the next page and then save and finish

### Install FFMPEG

Next your need FFMPEG on your system in able to process videos. To download
this for windows visit the following URL: http://ffmpeg.zeranoe.com/builds/

Extract the downloaded ZIP file obtained by clicking the blue "Download Build"
button. Once extracted open the folder, there will be an ffmpeg-<version> folder
open that. Once inside there, a bin folder will appear copy the bin folder Then 
go to C:\ in your windows explorer. (This usually has your Windows and Program
Files folder). Once there paste the bin folder directly to C:\bin.

Finally, we have to add the new path to your windows path to do this. 

Open command prompt and run this.

```dos
setx path "%path%;c:\bin"
```

To test this works close your command prompt. Then open it again. Once it is
open. Type the following

```dos
ffmpeg -version
```

You should see a long display of output starting with `ffmpeg version`

Cool! So that means your are ready to go from the external prerequisite 
perspective.

### Obtaining StretchFS and a runtime Environment



To clone StretchFS do the following after git is installed.

```
C:
cd \
mkdir opt
cd \opt
git clone https://github.com/nullivex/stretchfs.git
cd stretchfs
npm install
```

Once these steps have been completed your stretchfs instance is cloned and the
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
