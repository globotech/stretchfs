# StretchFS 1.4 Thoughts and Goals

## What is Currently Wrong

### Fix Tests to be more Reliable

First and foremost, what needs to be addressed are the immediate fires with
running the tests on the latest version of StretchFS and node. Currently, I am seeing
many failure all across the test spectrum.

### Automatic Self Healing

Secondly, and in my opinion by far the most important aspect of this build is
making sure that the cluster detects and marks hosts down actively rather than
depending on unreliable timeouts. What in theory should have caused a service
degredation was actually causing complete system failures. Thus, any single
failure of a component would render the cluster useless until service to the
failing store was either cured out the store manually marked inactive in the
admin panel.

### Lookup and Purchase Synchronization

Third, and this is one of the biggest issues. When a prism loses its state
which happens when the redis database gets expunged. It will start logging
false positives on purchases and lookup caching. This causes massive failures
to pop up with "purchase not found" errors. To correct this we are going to use
an authortative system to distribute content location databases and purchase
information databases.

## Ping Net

To address the first issue we are going to introduce a ping net. This means
every instance of StretchFS will participate in the ping net which will bring
consensus to what hosts are not available to the cluster.

To me this is the most imperative function that needs to be implemented in order
to have a truly self healing system. The goal is to provide higher quality
hosting of content which will result in higher yeilding inventory monetization.

The Ping Net will consist of running a ping service which can be enabled per
instance.

### Peer Registry

In order for hosts to know who to ping we need a registry. As StretchFS implements
a master to deal with authoritative issues a list of hosts can be easily
obtained from the master. This will be part of the ping service coming online
it will download the registry from the master. After the initial download the
registry will auto refresh every 60 seconds to be aware of changes that are made
at the master.

### Voting

Next will come the voting, in my opinion this is the safest way to ensure that
a peer is down from a majority of vectors to stop from false positives.

The voting system will be implemented using a list in redis, hosts will be
keyed by their IP address and the votes value will be the host of the IP who
is making the vote.

Each host can then use this information to decide on their own if a host is
available.

### Publishing State

Now that we have a peer registry, a poll center, and a way to decide if a host
is unavailable we need a way to publish the changes. This will consist of using
an API class that is made available through the helpers section of StretchFS. The
client code will then need to call upon this API before making decisions about
communicating with the host.

This part will involve scouring all of the prism and store code to make sure
that a call to a downed host is never made intentionally.

## Lookup Database

Next we need to start solving state issues with the prisms. Prisms need to be
able to come and go from the cluster as they please. The state should be
downloaded during the start up phase of the prism. This ensures that the prism
cannot proceed to an online state until it has fully downloaded the neccessary
information to do so. The idea is to prevent false negatives from being
propagated about data.

### Filling the Database

Each store instance will need to scan and report its inventory to the master.

Before it starts the inventory addition process it needs to download a copy
of what the master currently believes the host has. The host will then check
to make sure the that each entry the master has exists and if it does not
exist it will publish to the master that the content is no longer available
on this node. Contrarily, if the content is not in the database downloaded from
the master, it will publish that the new content is available to the master.

Even on large data sets, this script shouldnt take more than 90 seconds to run.
That being said, in production I would recommend syncing the inventory every
hour. The sync is advantageous to correct any issues from propagating new files.

### Keep the Database Current

Now in order to make the system respond instantly to new content. We will need
to publish content changes to the master as they happen. This will result in
adding code into a couple of places.

The best way to implement content database changes are at the store where they
happen. The store instances will directly publish changes to their content to
the master.

### Syncing the Changes to the Prisms

Prisms will feed from the database at no more than 5 second intervals to keep
state changes almost immediate.

The master will need to provide a feed which the prisms can use to update their
database accordingly.

## Purchase Database

Keeping purchases synchronized between prisms is paramount to keeping accurate
content requests during failures.

Currently, if a prism leaves the cluster and re-enters without the state
acquired during run time. The prism will start to produce 'purchase not found'
errors that are false negatives. This causes massive failures on content
retrieval as the prism will usually end up involved with nearly every end to
end request.

### Registering to the Database

When new purchases are created they will be published to the master and added
to the database with their expiration.

The database will then be pruned by a process on the master.

### Feeding the Database

The prisms will need to feed the database in order to stay informed. The goal
is to again get rid of the active publishing system in favor of a more passive
system.

The feed interval should be no more than 5 seconds.

### Pruning the Database

In order to keep the master from overflowing with purchases it will need to
prune purchases daily. With the expiration dates on purchases it will be
easy to perform the pruning.

## Clean Ups

Lastly, I want to make some clean ups to the overall code base and especially
the testing process.

Right now, I believe many of the tests have the error of relying on one another
to run. So we need to ad more scaffolding to be able to run tests in a more
concise manner.
