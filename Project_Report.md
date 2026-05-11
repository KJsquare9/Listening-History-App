# Project Report: Music Listening Analysis Tool

## Introduction

For this project I built a web app that takes a person's music listening history and turns it into a visual emotional map. The main idea is that a listening session is not just a list of songs. It also has a sequence, a pace, repeated patterns, and emotional movement over time. I wanted the app to show that movement in a way that was easier to understand than just reading rows from a spreadsheet.

The project uses the valence-arousal model from music psychology. In simple terms, valence describes whether a song feels more positive or negative, while arousal describes how energetic or intense it feels. A calm sad song would usually have low valence and low arousal. A loud exciting song might have high arousal and higher valence. A tense or angry song could have high arousal but lower valence. This two-dimensional model gave me a practical way to place songs on an emotional plane.

The app is not meant to diagnose anyone or make clinical claims. The datasets in this project are synthetic, including the reference listener groups. The goal is to demonstrate the pipeline: take listening records, extract useful metadata, connect songs to emotional features, reconstruct the session in time order, and visualize the emotional shape of the listening behavior.

## What The Input Represents

The input to the app is a listening history file. The project supports Spotify-style exports, YouTube Music-style history files, and generic CSV or TSV files. The exact column names can vary a bit, but the app is looking for the same basic information each time:

- the track name
- the artist name
- the timestamp of the play
- the amount of time listened, in milliseconds

Those fields are important because they describe both content and behavior. The track and artist identify what was played. The timestamp tells the app when it happened. The duration gives a rough idea of how much attention the listener gave to that track.

A listening history file by itself is not yet a psychological representation. At first it is just event data. For example, it may say that a user listened to one Taylor Swift song at 10:00, another song at 10:05, then a different artist later. The app has to turn those rows into a session that can be analyzed. That means parsing the file, cleaning the fields, converting timestamps into a consistent format, and keeping the events in chronological order.

This ordering matters a lot. If I only calculated averages, the app would lose the feeling of a session unfolding. Two listening sessions can have the same average valence and arousal but feel very different. One might slowly move from sad to energetic songs. Another might jump back and forth between emotional extremes. The timestamp order is what lets the app show that difference.

## Turning Listening History Into Emotional Data

After the app extracts the listening events, it needs to connect each song to emotional features. In this project, those values come from an internal song dataset stored with the app. The dataset maps track and artist names to valence and arousal scores, along with some supporting attributes such as energy, tempo, genre, mood, and danceability.

The app does not call an outside API during analysis. It also does not calculate valence and arousal directly from raw audio. Instead, it uses metadata matching. A listening event says "this track by this artist was played," and the app tries to find the same track in the internal song table. If it finds a match, it attaches the emotional values from that table to the event.

The valence and arousal values are scaled from 0 to 1. A value closer to 0 means lower valence or lower arousal, and a value closer to 1 means higher valence or higher arousal. This common scale is useful because every matched song can be plotted on the same coordinate plane. The x-axis becomes valence and the y-axis becomes arousal.

Matching was one of the messier parts of the project, because music metadata is not always clean. A song title might include punctuation, parentheses, or featured artists. Artist names may be written slightly differently across platforms. To handle this, the app normalizes text before matching. It lowercases names, removes some punctuation, strips parenthetical text, and handles things like "feat." or "featuring." I eventually added this because exact matching was too brittle. A song could clearly be the same song but fail because one version had extra text in the title.

The app first tries to match using both track and artist. If that fails, it can fall back to matching by track name. That improves coverage, but it is also an assumption. Two different artists can have songs with the same name, so track-only matching is not perfect. I kept it because the demo dataset is controlled, and for this project it was more useful to show the analysis flow than to reject many songs over small metadata differences.

If a song cannot be matched, the app does not delete it. It stays in the listening history, but it does not get valence or arousal values. This is important because unmatched songs still count toward total listening duration and match coverage. The emotional charts use only matched songs, but the app remains honest about how much of the session it could actually map.

## The Emotional Mapping Pipeline

The full pipeline works like this:

Input file -> metadata extraction -> track matching -> emotional feature association -> session reconstruction -> metric computation -> visualization rendering

Conceptually, each stage changes the data into a more meaningful form.

The input file is just platform data. It might come from Spotify, YouTube Music, or a spreadsheet. The metadata extraction stage turns that into a consistent event format with track, artist, timestamp, and duration. Track matching connects each event to the internal song dataset. Emotional feature association adds valence and arousal. Session reconstruction uses timestamps to keep the listening events in order. Metric computation summarizes the session. Finally, the visualizations turn those numbers into shapes that a person can inspect.

I tried to keep these stages separate because each stage answers a different question. Parsing asks, "What did the user listen to?" Matching asks, "Do I know emotional information about this song?" Session ordering asks, "How did the listening unfold over time?" The charts then ask, "What emotional pattern does this create?"

## Valence And Arousal In This Project

Valence and arousal were useful because they are simple enough to visualize but still expressive. A single mood label like "happy" or "sad" would be too limited. Music can be sad but intense, calm but positive, angry but energetic, or nostalgic and low-energy. A two-dimensional space handles those differences better than a single category.

In the app, every matched track becomes a point:

- x-position = valence
- y-position = arousal

So a song with valence 0.80 and arousal 0.70 appears toward the upper-right part of the chart. A song with valence 0.25 and arousal 0.35 appears lower and more to the left. This makes the chart feel like a map of the session's emotional territory.

One thing I had to keep in mind is that these values are still simplified. A song's emotional meaning can depend on the listener, context, memory, lyrics, and culture. The app treats the song's stored valence-arousal values as a general representation, not a perfect measurement of what the listener personally felt. That is a limitation, but it is also what makes the project manageable.

## Trajectory Visualization

The main visualization is the valence-arousal trajectory plot. This chart is the centerpiece because it shows emotional movement, not just emotional averages.

Each point on the plot represents a matched track. The x-axis is valence, and the y-axis is arousal. The app connects points in listening order, so the session becomes a path through emotional space. The line between two points represents a transition from one song's emotional position to the next.

This is useful because listening is sequential. People do not experience songs all at once as a summary statistic. They move from one song to another. A session might start with calm low-valence songs, shift into brighter high-valence music, then end with energetic tracks. Averages would flatten that into one number, but the trajectory shows the drift.

I also used a color progression along the path, moving from cooler colors near the start to warmer colors near the end. This helps the user read direction. Without direction, a connected path can become confusing because it is not obvious where the session begins or ends.

The trajectory chart can show several patterns:

- emotional consistency, when points stay clustered in one area
- emotional volatility, when the path jumps between distant regions
- gradual emotional drift, when the line slowly moves across the plane
- repeated emotional returns, when the path loops back to a similar region

The app does not currently compute a separate "volatility score," but the visual pattern makes volatility visible. If the line is short and clustered, the session is emotionally consistent. If the line zigzags across the chart, the session has more emotional variation.

## Time Series View

The time series chart shows valence and arousal as two lines across play order. I added this because the trajectory plot is good for emotional geography, but it can hide the exact timing of changes when many points overlap.

In the time series view, the x-axis is the sequence of plays, and the y-axis is the emotional score. Valence and arousal are drawn separately. This makes it easier to see moments like:

- arousal rising while valence stays similar
- valence dropping after a certain point in the session
- a sudden emotional spike
- a long stretch of stable listening

This chart helps answer a slightly different question from the trajectory plot. The trajectory asks, "Where did the session move emotionally?" The time series asks, "When did those emotional changes happen?"

At first I thought the trajectory plot might be enough, but once I tested sessions with more tracks, the time series became necessary. Dense paths can look visually interesting but hard to read. Splitting valence and arousal into lines makes the progression clearer.

## Session Metrics

The app shows several summary metrics so the user can understand the session before looking closely at the charts.

The total track count shows how many listening events were parsed from the file. This is basic, but it is useful because it confirms whether the upload was read properly.

The match rate shows what percentage of events were successfully connected to the internal song dataset. This is one of the most important quality indicators in the app. If the match rate is low, the emotional charts only represent a small part of the listening history. A high match rate means the emotional analysis covers more of the session.

Average valence is the mean emotional positivity of the matched tracks. A higher average suggests the session leaned toward more positive-sounding songs. A lower average suggests more negative, sad, tense, or darker emotional content, depending on the songs.

Average arousal is the mean intensity or energy of the matched tracks. A high arousal average suggests a more energetic or emotionally intense session. A low arousal average suggests calmer, slower, or more subdued listening.

Total listening duration is calculated from the milliseconds played. It gives context to the session. For example, a session with 10 short skips should not be interpreted the same way as a session where the listener spent an hour with a group of songs.

The charts also reveal analytical ideas that are not shown as separate numeric cards yet. Density and clustering show whether the listener stayed in one emotional region. Transitions show how sharply the listener moved between emotional states. Emotional consistency appears when points and lines stay compact. Emotional volatility appears when the path covers large distances or jumps between opposite areas. These are visual insights rather than formal computed metrics in the current version.

## Duration Analysis

The duration chart ranks tracks by listening time. I included this because emotional mapping should not treat every event as equally meaningful. A song played for a few seconds might be a skip. A song played almost fully probably represents a stronger listening choice.

The current app does not weight the valence-arousal averages by duration, but the duration chart still gives useful context. If a highly emotional song appears in the trajectory but was only played briefly, that is different from a song the listener stayed with for several minutes. This is one area where I would like to improve the analysis later by adding duration-weighted summaries.

Another reason the duration chart matters is that it works even for unmatched tracks. If a song does not exist in the internal emotional dataset, it cannot appear in the valence-arousal charts, but its listening duration still tells us something about behavior.

## Reference Comparison

The app also compares the user's mapped listening session against two synthetic reference groups: a high-depression reference listener and a low-depression reference listener. These groups are stored as listening histories, not as fixed summary numbers. They go through the same enrichment process as the user data, which keeps the comparison fair.

The purpose of the comparison is not to classify the user. It is more like context. A user's session can be plotted alongside reference sessions to see whether the emotional distribution is closer to one group, spread between both, or different from both.

The comparison chart overlays the user's matched tracks with the reference tracks on the same valence-arousal plane. This makes it possible to compare:

- where the points cluster
- whether one group leans lower or higher in valence
- whether one group has higher arousal
- how concentrated or spread out each listening profile is
- how the user's emotional path differs from the references

I initially tried showing multiple flow lines at once, but it became too cluttered. The final design keeps all point clouds visible and lets the user choose which flow line to draw. That made the comparison easier to read because the user can focus on one movement pattern at a time while still seeing the overall distribution.

The reference groups are synthetic, so they should be understood as demonstration profiles. In a real research version, these groups would need to come from carefully collected and ethically handled participant data. For this project, they show how the system could support comparative analysis without claiming real diagnostic power.

## Why These Visualizations Were Chosen

I chose the charts based on what each one explains best.

The trajectory plot shows emotional movement better than a table or a static average. It lets the user see the path of the session and notice emotional drift or sudden changes.

The time series chart shows progression more clearly. It is easier to see whether valence or arousal rises, falls, or spikes at certain points.

The reference comparison chart gives context. A single user's emotional map is interesting, but it becomes more meaningful when placed beside other listening profiles.

The duration chart adds behavioral weight. It shows which tracks took up the most listening time, including unmatched songs that cannot be emotionally plotted.

Together, these views show different sides of the same session. The goal was not to make as many charts as possible. I wanted each chart to answer a question that the others did not fully answer.

## Design Reasoning

I wanted the interface to feel like a music psychology dashboard, not just a basic upload form. The dark visual style helps the colored charts stand out, and it also fits the emotional-analysis theme. The layout puts the visualization area in the center because the graph is the main result of the pipeline.

The summary cards are kept nearby because they help interpret the charts. For example, if the match rate is low, the user should be cautious about reading too much into the trajectory. If the average arousal is high, the time series can show whether that came from the whole session or just a few intense songs.

The date filter lets the user narrow the session to a specific time window. This matters because listening behavior can change across days or periods. A long history may contain multiple moods or contexts, so filtering makes the analysis more focused.

One design challenge was avoiding visual clutter. Emotional trajectories can get dense quickly, especially when many tracks are close together. I used tooltips so the chart can stay visually clean while still allowing detailed inspection of individual songs.

## Assumptions And Limitations

The biggest assumption is that the internal valence-arousal value for a song is a reasonable emotional representation. That is useful for visualization, but it does not capture personal meaning. A song that is generally upbeat might feel sad to a specific listener because of memory or context.

Another limitation is matching. The app depends on track and artist names. If metadata is inconsistent, songs may fail to match or, in rare cases, match incorrectly. A stronger version of the system would use more reliable identifiers or fuzzy matching.

The project also uses synthetic song and reference datasets. That means the charts demonstrate the method, not a real psychological study. A real study would need validated data sources, clearer participant grouping, consent, and stronger statistical checks.

The current metrics are also intentionally simple. The app shows averages, match coverage, and duration, while more advanced ideas like volatility, clustering, similarity scores, and duration-weighted emotional summaries are mostly interpreted visually. Those would be good future additions.

## What I Learned

The main thing I learned is that the hard part is not just drawing charts. The hard part is deciding what the chart should mean. A listening history can be represented in many ways, but some representations hide the most interesting parts. Averages are easy to compute, but they miss movement. A trajectory is harder to read at first, but it shows the emotional flow of the session much better.

I also realized how important the middle of the pipeline is. Parsing the file is only the first step. The system has to normalize metadata, match songs carefully, keep unmatched songs visible, preserve time order, and report match coverage. If any of those steps are hidden or handled badly, the final visualization can be misleading.

By the end, the project became a working example of how raw listening history can be transformed into an emotional representation. It starts with ordinary metadata, connects it to valence and arousal, reconstructs the listening session over time, and then shows the result through charts that focus on movement, intensity, consistency, and comparison. That was the main goal: not just to show what someone listened to, but to show the emotional shape of how they listened.
