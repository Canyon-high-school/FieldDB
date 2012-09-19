var couch_keys = require("./couchkeys_devserver")
    , node_config = require("./nodeconfig_devserver")
    , cradle = require('cradle')
    , fs = require('fs')
    , util = require('util');

console.log("Loading the Corpus Builder Module");

/*
 * This function creates a new db/corpus using parameters in the dbConnection
 * object, which user it is for, as well as callbacks for success or error. It
 * also builds out the default security settings (ie access control lists, roles
 * and role based permissions for the user's corpus implemented as security
 * settings on the created couchdb
 * 
 * The corpus is composed of the pouchname, prefixed with the user's username
 */
var createDbaddUser = function(dbConnection, user, successcallback,
    errorcallback) {
  dbConnection.pouchname = user.username + "-" + dbConnection.pouchname;
  console.log("Creating a new database/corpus: " + dbConnection.pouchname);
  var c = new cradle.Connection(dbConnection.protocol + dbConnection.domain,
      dbConnection.port, {
        auth : {
          username : couch_keys.username,
          password : couch_keys.password
        }
      // TODO make the username and password come from the user's default config
      // for their couch connection
      });
  var db = c.database(dbConnection.pouchname);
  db
      .exists(function(err, exists) {
        if (err) {
          console.log('error', err);
          if (typeof errorcallback == "function") {
            errorcallback(err);
          }
        } else if (exists) {
          console.log("The corpus exists, calling the errorcallback.");
          var errmessage = 'The database/corpus already exists, this is problematic. You should choose another corpus name.';
          if (typeof errorcallback == "function") {
            errorcallback(errmessage);
          }
        } else {
          // Create database/corpus
          console.log('Database/corpus ' + dbConnection.pouchname
              + ' does not exist, creating it.');
          db
              .create(function(err, res) {
                console.log("In the callback of db create for "
                    + dbConnection.pouchname);
                if (err) {
                  console.log("Here is the err: " + err);
                }
                /*
                 * Upon success of db creation, set up the collaborator,
                 * contributor and admin roles for this corpus
                 * 
                 * Admins: The admins can perform any operation on the corpus.
                 * Members: By adding items to the members the corpus becomes
                 * non-public in the sense of couch not allowing access. We can
                 * still use FieldDB to perform a fine grained control by
                 * creating a special fielddbpublicuser which is essentially the
                 * checkbox that the user can check to make the corpus private,
                 * and adding all fielddbusers to a role fielddbusers which can
                 * let the user make the corpus private to the world, but
                 * viewable by fielddbusers (to let only signed in users comment
                 * on their data etc)
                 * 
                 * If public corpus (by default its private): -signed in
                 * fielddbusers can read other user's corpora until the user
                 * takes that role off -public user (ie the general public) can
                 * see the user's corpora through fielddb, but not directly the
                 * couch database. This is how the public checkbox is
                 * implemented in fielddb.
                 * 
                 * References: http://127.0.0.1:5984/john7corpus/_security
                 */
                var collaborator = "collaborator";
                var contributor = "contributor";
                var admin = "admin";
                var securityParamsforNewDB = {
                  "admins" : {
                    "names" : [ '"' + user.username + '"' ],
                    "roles" : [ '"' + dbConnection.pouchname + "_" + admin
                        + '"' ]
                  },
                  "members" : {
                    "names" : [],
                    "roles" : [
                        '"' + dbConnection.pouchname + "_" + collaborator + '"',
                        '"' + dbConnection.pouchname + "_" + contributor + '"' ]
                  }
                };
                db.save("_security", securityParamsforNewDB,
                    function(err, doc) {
                      if (doc == undefined) {
                        doc = {
                          error : err
                        };
                      }
                      if (err != null || !doc.ok) {
                        console.log("Here are the errors " + util.inspect(err)
                            + " \n Here is the doc we get back "
                            + util.inspect(doc));
                      } else {
                        console.log("_security created");
                      }
                    });

                /*
                 * Create the user, give them the admin role on their corpus,
                 * add them to the fielddbuser role so that others can let them
                 * see their corpora if they decide to let logged in
                 * fielddbusers see their corpus.
                 * 
                 * references:
                 * http://blog.mattwoodward.com/2012/03/definitive-guide-to-couchdb.html
                 */
                var usersdb = c
                    .database(
                        "_users",
                        function() {
                          console
                              .log("In the callback of opening the users database.");
                        });
                var userid = 'org.couchdb.user:' + user.username;
                var userParamsForNewUser = {
                  name : user.username,
                  password : user.password,
                  roles : [ '"' + dbConnection.pouchname + "_" + admin + '"',
                      '"' + dbConnection.pouchname + "_" + contributor + '"',
                      "fielddbuser" ],
                  type : 'user'
                };
                usersdb.save(userid, userParamsForNewUser, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console.log("user added");
                  }
                });

                /*
                 * Make the corpus writable by only contributors/admins that the
                 * user has authorized.
                 */
                var blockNonContribAdminWrites = "function(new_doc, old_doc, userCtx) {   if( (userCtx.roles.indexOf('"
                    + dbConnection.pouchname
                    + "_"
                    + contributor
                    + "') == -1 ) && (userCtx.roles.indexOf('"
                    + dbConnection.pouchname
                    + "_"
                    + admin
                    + "') == -1 ) ) {     throw({forbidden: 'Not Authorized, you are not a "
                    + contributor
                    + " on "
                    + dbConnection.pouchname
                    + ", you will have to ask "
                    + user.username
                    + " to add you as a "
                    + contributor
                    + ". You currently have these roles: '+userCtx.roles});   } }  ";
                db.save("_design/blockNonContribAdminWrites", {
                  "language" : "javascript",
                  "validate_doc_update" : blockNonContribAdminWrites
                }, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console.log("blockNonContribAdminWrites created");
                  }
                });

                /*
                 * The view that sorts by the ids by dateModified.
                 */
                var sortByDateModified = "function (doc) {"
                    + "if (doc.dateModified) {"
                    + "emit(doc.dateModified, doc);" + "}" + "}";
                db.save("_design/get_ids", {
                  "language" : "javascript",
                  "views" : {
                    "by_date" : {
                      "map" : sortByDateModified
                    }
                  }
                }, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console.log("get_ids created");
                  }
                });

                /*
                 * The view that does word counts by rhyming order from words in
                 * grammatical utterances
                 */
                var countWordsInUtteranceByRymingOrder = "function(doc) {\n"
                    + "                  // If the document is a Datum\n"
                    + "                  if (doc.audioVideo) {\n"
                    + "                    // Loop over all its DatumFields\n"
                    + "                    for ( var key in doc.datumFields) {\n"
                    + "                      // If the DatumField contains the Judgement\n"
                    + "                      if (doc.datumFields[key].label == 'judgement') {\n"
                    + "                        // If the Judgement contains a '*', don't count the\n"
                    + "                        // words in it\n"
                    + "                        if (doc.datumFields[key].mask.indexOf('*') >= 0) {\n"
                    + "                          return;\n"
                    + "                        }\n"
                    + "                        break;\n"
                    + "                      }\n"
                    + "                    }\n"
                    + "                    // Loop over all its DatumFields\n"
                    + "                    for ( var key in doc.datumFields) {\n"
                    + "                      // If the DatumField contains the Utterance\n"
                    + "                      if (doc.datumFields[key].label == 'utterance') {\n"
                    + "                        // Trim whitespace\n"
                    + "                        var utterance = doc.datumFields[key].mask.trim();\n"
                    + "                        // If the utterance is ungrammatical, don't count the\n"
                    + "                        // words in it\n"
                    + "                        if (utterance.indexOf('*') == 0) {\n"
                    + "                          return;\n"
                    + "                        }\n"
                    + "                        // Tokenize the utterance\n"
                    + "                        var words = utterance.toLowerCase().split(\n"
                    + "                            /[#?!.,\\/ -]+/);\n"
                    + "                        // For each token\n"
                    + "                        for ( var word in words) {\n"
                    + "                          // If the token it not null or the empty string\n"
                    + "                          if (words[word]) {\n"
                    + "                            // Replace (*_) with ''\n"
                    + "                            var feederWord = words[word].replace(\n"
                    + "                                /\\(\\*[^)]*\\)/g, '');\n"
                    + "                            // Replace *(_) with _\n"
                    + "                            feederWord = feederWord.replace(/\\*\\(([^)]*)\\)/,\n"
                    + "                                '$1');\n"
                    + "                            // Remove all parentheses and *\n"
                    + "                            var fullWord = feederWord.replace(/[(*)]/g, '');\n"
                    + "                            // Remove parentheses and all characters between the\n"
                    + "                            // parentheses\n"
                    + "                            var option1 = feederWord.replace(/\\([^)]*\\)/g, '');\n"
                    + "                            // If those two removals ended up with difference\n"
                    + "                            // strings\n"
                    + "                            if (fullWord != option1) {\n"
                    + "                              // Emit the version without the characters between the parentheses\n"
                    + "                              emit([ option1.split('').reverse().join(''),\n"
                    + "                                  option1 ], 1);\n"
                    + "                            }\n"
                    + "                            // Emit the version without parentheses\n"
                    + "                            emit([ fullWord.split('').reverse().join(''),\n"
                    + "                                fullWord ], 1);\n"
                    + "                          }\n"
                    + "                        }\n"
                    + "                      }\n" + "                    }\n"
                    + "                  }\n" + "                }";
                var countReduce = "function(keys, values, rereduce) {"
                    + "return sum(values);" + "}";

                db.save("_design/get_grammatical_words_by_rhyming_order", {
                  "language" : "javascript",
                  "views" : {
                    "by_rhyming" : {
                      "map" : countWordsInUtteranceByRymingOrder,
                      "reduce" : countReduce
                    }
                  }
                }, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console
                        .log("get_grammatical_words_by_rhyming_order created");
                  }
                });

                /*
                 * The view that does finds morpheme gloss pairs in grammatical
                 * datum
                 */
                var extractGlossMorphemeSetsFromDatums = "function(doc) {\n"
                    + "// If the document is a Datum\n"
                    + "if (doc.audioVideo) {\n"
                    + "// Loop over all its DatumFields\n"
                    + "for (var key in doc.datumFields) {\n"
                    + "// If the DatumField contains the Judgement\n"
                    + "if (doc.datumFields[key].label == 'judgement') {\n"
                    + "// If the Judgement contains a '*', don't count the words in it\n"
                    + "if (doc.datumFields[key].mask.indexOf('*') >= 0) {\n"
                    + "return;\n"
                    + "}\n"
                    + "break;\n"
                    + "}\n"
                    + "}\n"
                    + "var context = {};\n"
                    + "// Loop over all its DatumFields\n"
                    + "for (var key in doc.datumFields) {\n"
                    + "// If the DatumField contains the Utterance\n"
                    + "if (doc.datumFields[key].label == 'utterance') {\n"
                    + "// Trim whitespace\n"
                    + "var utterance = doc.datumFields[key].mask.trim();\n"
                    + "// If the utterance is ungrammatical, don't count the words in it\n"
                    + "if (utterance.indexOf('*') == 0) {\n"
                    + "return;\n"
                    + "}\n"
                    + "if (utterance == '') {\n"
                    + "return;\n"
                    + "}\n"

                    + "// Tokenize the utterance\n"
                    + "var words = utterance.toLowerCase().replace(/#?!.,\\//g,'').split(/[ ]+/);\n"
                    + "for (var word in words) {\n"
                    + "// If the token it not null or the empty string\n"
                    + "if (words[word]) {\n"
                    + "// Replace (*_) with ''\n"
                    + "var feederWord = words[word].replace(/\\(\\*[^)]*\\)/g, '');\n"
                    + "// Replace *(_) with _\n"
                    + "feederWord = feederWord.replace(/\\*\\(([^)]*)\\)/, '$1');\n"
                    + "// Remove all parentheses and *\n"
                    + "var fullWord = feederWord.replace(/[(*)]/g, '');\n"
                    + "words[word] = fullWord;\n"
                    + "}\n"
                    + "}\n"
                    + "context.words = words;\n"
                    + "}\n"
                    + "if (doc.datumFields[key].label == 'morphemes') {\n"
                    + "// Trim whitespace\n"
                    + "var morphemesline = doc.datumFields[key].mask.trim();\n"
                    + "// Tokenize the morphemes\n"
                    + "var morphemes = morphemesline.replace(/#!,\\//g,'').split(/[ ]+/);\n"
                    + "for (var morphemegroup in morphemes) {\n"
                    + "// If the token it not null or the empty string\n"
                    + "if (morphemes[morphemegroup]) {\n"
                    + "// Replace (*_) with ''\n"
                    + "var feederWord = morphemes[morphemegroup].replace(/\\(\\*[^)]*\\)/g, '');//DONT replace ? it is used to indicate uncertainty with the data, . is used for fusional morphemes\n"
                    + "// Replace *(_) with _\n"
                    + "feederWord = feederWord.replace(/\\*\\(([^)]*)\\)/, '$1');\n"
                    + "// Remove all parentheses and *\n"
                    + "var fullWord = feederWord.replace(/[(*)]/g, '');\n"
                    + "morphemes[morphemegroup] = fullWord;\n"
                    + "}\n"
                    + "}\n"
                    + "context.morphemes = morphemes;\n"
                    + "}\n"
                    + "if (doc.datumFields[key].label == 'gloss') {\n"
                    + "// Trim whitespace\n"
                    + "var gloss = doc.datumFields[key].mask.trim();\n"
                    + "// Tokenize the gloss\n"
                    + "var glosses = gloss.replace(/#!,\\//g,'').split(/[ ]+/);//DONT replace ? it is used to indicate uncertainty with the data, . is used for fusional morphemes\n"
                    + "for (var glossgroup in glosses) {\n"
                    + "// If the token it not null or the empty string\n"
                    + "if (glosses[glossgroup]) {\n"
                    + "// Replace (*_) with ''\n"
                    + "var feederWord = glosses[glossgroup].replace(/\\(\\*[^)]*\\)/g, '');\n"
                    + "// Replace *(_) with _\n"
                    + "feederWord = feederWord.replace(/\\*\\(([^)]*)\\)/, '$1');\n"
                    + "// Remove all parentheses and *\n"
                    + "var fullWord = feederWord.replace(/[(*)]/g, '');\n"
                    + "glosses[glossgroup] = fullWord;\n" + "}\n" + "}\n"
                    + "context.glosses = glosses;\n" + "}\n" + "}\n"
                    + "//Build triples\n" + "for(var j in context.words){\n"
                    + "var w = context.words[j];\n"
                    + "var ms = context.morphemes[j].split('-');\n"
                    + "var gs = context.glosses[j].split('-');\n"
                    + "for (var i in ms){\n"
                    + "emit({morpheme: ms[i], gloss: gs[i]|| '??'}, 1);\n"
                    + "}\n" + "}\n" + "}\n" + "}";

                db.save("_design/lexicon", {
                  "language" : "javascript",
                  "views" : {
                    "create_triples" : {
                      "map" : extractGlossMorphemeSetsFromDatums,
                      "reduce" : countReduce
                    }
                  }
                }, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console.log("lexicon created");
                  }
                });

                /*
                 * The view that does word counts by rhyming order from words in
                 * grammatical utterances
                 */
                var extractPrecedenceRulesFromMorphemes = "function(doc) {\n"
                    + "          // If the document is a Datum\n"
                    + "          if (doc.audioVideo) {\n"
                    + "            // Loop over all its DatumFields\n"
                    + "            for (var key in doc.datumFields) {\n"
                    + "              // If the DatumField contains the Judgement\n"
                    + "              if (doc.datumFields[key].label == 'judgement') {\n"
                    + "                // If the Judgement contains a '*', don't count the words in it\n"
                    + "                if (doc.datumFields[key].mask.indexOf('*') >= 0) {\n"
                    + "                  return;\n"
                    + "                }\n"
                    + "                break;\n"
                    + "              }\n"
                    + "            } \n"
                    + "            var processPrecedenceRules = function(word){\n"
                    + "              if(word == ''){\n"
                    + "                return;\n"
                    + "              }\n"
                    + "              word = word.replace(/^-/,'').replace(/-$/,'');\n"
                    + "              var morphemes = word.trim().split('-');\n"
                    + "              var previousmorph = '@';\n"
                    + "              if(morphemes.length == 0){\n"
                    + "                return;\n"
                    + "              }\n"
                    + "              morphemes.push('@');\n"
                    + "              for(var morph in morphemes){\n"
                    + "          var rule = {};\n"
                    + "          rule.x = previousmorph;\n"
                    + "                rule.relation = 'preceeds';\n"
                    + "                rule.y = morphemes[morph];\n"
                    + "                rule.context = word;\n"
                    + "                emit(rule, 1);\n"
                    + "                previousmorph = morphemes[morph];\n"
                    + "              }\n"
                    + "            }\n"
                    + "            // Loop over all its DatumFields\n"
                    + "            for (var key in doc.datumFields) {\n"
                    + "              // If the DatumField contains the Utterance\n"
                    + "              if (doc.datumFields[key].label == 'morphemes') {\n"
                    + "                // Trim whitespace\n"
                    + "                var morphemesLine = doc.datumFields[key].mask.trim();\n"
                    + "                // If the morphemesLine is ungrammatical, don't count the words in it\n"
                    + "                if (morphemesLine.indexOf('*') == 0) {\n"
                    + "                  return;\n"
                    + "                }\n"
                    + "                // Tokenize the morphemesLine\n"
                    + "                var words = morphemesLine.toLowerCase().split(/[#?!.,\/ ]+/);\n"
                    + "                // For each token\n"
                    + "                for (var word in words) {\n"
                    + "                  // If the token it not null or the empty string\n"
                    + "                  if (words[word]) {\n"
                    + "                    // Replace (*_) with ''\n"
                    + "                    var feederWord = words[word].replace(/\\(\\*[^)]*\\)/g, '');\n"
                    + "                    // Replace *(_) with _\n"
                    + "                    feederWord = feederWord.replace(/\\*\\(([^)]*)\\)/, '$1');\n"
                    + "                    // Remove all parentheses and *\n"
                    + "                    var fullWord = feederWord.replace(/[(*)]/g, '');\n"
                    + "                    // Remove parentheses and all characters between the parentheses\n"
                    + "                    var option1 = feederWord.replace(/\\([^)]*\\)/g, '');\n"
                    + "                    // If those two removals ended up with difference strings\n"
                    + "                    if (fullWord != option1) {\n"
                    + "                      // Emit the version without the characters between the parentheses\n"
                    + "                      processPrecedenceRules(option1);\n"
                    + "                    }\n"
                    + "                    // Emit the version without parentheses\n"
                    + "                    processPrecedenceRules(fullWord);\n"
                    + "                  }\n" + "                }\n"
                    + "              }\n" + "            }\n" + "          }\n"
                    + "        }";

                db.save("_design/get_precedence_rules_from_morphemes", {
                  "language" : "javascript",
                  "views" : {
                    "precedence_rules" : {
                      "map" : extractPrecedenceRulesFromMorphemes,
                      "reduce" : countReduce
                    }
                  }
                }, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console.log("get_precedence_rules_from_morphemes created");
                  }
                });

                /**
                 * Make the corpus' datums searchable.
                 */
                var searchDatum = "function (doc) {"
                    + "if ((doc.datumFields) && (doc.session)) {"
                    + "var obj = {};"
                    + "for (i = 0; i < doc.datumFields.length; i++) {"
                    + "if (doc.datumFields[i].mask) {"
                    + "obj[doc.datumFields[i].label] = doc.datumFields[i].mask;"
                    + "}"
                    + "}"
                    + "if (doc.session.sessionFields) {"
                    + "for (j = 0; j < doc.session.sessionFields.length; j++) {"
                    + "if (doc.session.sessionFields[j].mask) {"
                    + "obj[doc.session.sessionFields[j].label] = doc.session.sessionFields[j].mask;"
                    + "}" + "}" + "}" + "emit(obj, doc._id);" + "}" + "}";
                db.save("_design/get_datum_field", {
                  "language" : "javascript",
                  "views" : {
                    "get_datum_fields" : {
                      "map" : searchDatum
                    }
                  }
                }, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console.log("get_datum_field created");
                  }
                });

                /*
                 * Prepare activity feed couches
                 */
                createDBforCorpusTeamsActivities(
                    dbConnection,
                    user,
                    function(res) {
                      console
                          .log("There was success in creating the corpus team's activity feed: "
                              + res);

                      createDBforUsersActivities(
                          user.activityCouchConnection,
                          user,
                          function(res) {
                            console
                                .log("There was success in creating the users activity feed: "
                                    + res);

                          },
                          function(err) {
                            console
                                .log("There was an error in creating users activity feed: "
                                    + err);
                          });

                    },
                    function(err) {
                      console
                          .log("There was an error in creating the corpus team's activity feed: "
                              + err);
                    });

              });// end createdb
        }
      });
};
/*
 * This function creates a new corpus team activity feed database
 * 
 * The db is composed of the pouchname
 */
var createDBforCorpusTeamsActivities = function(dbConnection, user,
    successcallback, errorcallback) {
  dbConnection.pouchname = dbConnection.pouchname + "-activity_feed";
  console.log("Creating a new database/corpus: " + dbConnection.pouchname);
  var c = new cradle.Connection(dbConnection.protocol + dbConnection.domain,
      dbConnection.port, {
        auth : {
          username : couch_keys.username,
          password : couch_keys.password
        }
      // TODO make the username and password come from the user's default config
      // for their couch connection
      });
  var db = c.database(dbConnection.pouchname);
  db
      .exists(function(err, exists) {
        if (err) {
          console.log('error', err);
          if (typeof errorcallback == "function") {
            errorcallback(err);
          }
        } else if (exists) {
          console
              .log("The users activity db exists, calling the errorcallback.");
          var errmessage = 'The database already exists, this is problematic.';
          if (typeof errorcallback == "function") {
            errorcallback(errmessage);
          }
        } else {
          // Create database/corpus
          console.log('Database ' + dbConnection.pouchname
              + ' does not exist, creating it.');
          db
              .create(function(err, res) {
                console.log("In the callback of db create for "
                    + dbConnection.pouchname);

                if (err != null) {
                  console.log("Here are the errors " + util.inspect(err));
                } else {
                  console.log("corpus created");
                }

                /*
                 * Upon success of db creation, set up the collaborator,
                 * contributor and admin roles for this corpus teams activity
                 * feed, at the moment its readers are the same as the corpus
                 * itself, and its admins are only the app.
                 * 
                 * References: http://127.0.0.1:5984/john7corpus/_security
                 */
                var collaborator = "collaborator";
                var contributor = "contributor";
                var admin = "admin";
                var securityParamsforNewDB = {
                  "admins" : {
                    "names" : [ '"fielddbdbadmin"' ],
                    "roles" : []
                  },
                  "members" : {
                    "names" : [],
                    "roles" : [
                        '"'
                            + dbConnection.pouchname.replace("-activity_feed",
                                "") + "_" + collaborator + '"',
                        '"'
                            + dbConnection.pouchname.replace("-activity_feed",
                                "") + "_" + contributor + '"' ]
                  }
                };
                db.save("_security", securityParamsforNewDB,
                    function(err, doc) {
                      if (doc == undefined) {
                        doc = {
                          error : err
                        };
                      }
                      if (err != null || !doc.ok) {
                        console.log("Here are the errors " + util.inspect(err)
                            + " \n Here is the doc we get back "
                            + util.inspect(doc));
                      } else {
                        console.log("_security created");
                      }
                    });

                /*
                 * Make the corpus team's activity feed writable by only
                 * contributors that the team admin has authorized.
                 */
                var blockNonContribAdminWrites = "function(new_doc, old_doc, userCtx) {   if( (userCtx.roles.indexOf('"
                    + dbConnection.pouchname.replace("-activity_feed", "")
                    + "_"
                    + contributor
                    + "') == -1 ) && (userCtx.roles.indexOf('"
                    + dbConnection.pouchname.replace("-activity_feed", "")
                    + "_"
                    + admin
                    + "') == -1 ) ) {     throw({forbidden: 'Not Authorized, you are not a "
                    + contributor
                    + " on "
                    + dbConnection.pouchname.replace("-activity_feed", "")
                    + ", you will have to ask "
                    + user.username
                    + " to add you as a "
                    + contributor
                    + ". You currently have these roles: '+userCtx.roles});   } }  ";
                db.save("_design/blockNonContribAdminWrites", {
                  "language" : "javascript",
                  "validate_doc_update" : blockNonContribAdminWrites
                }, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console.log("blockNonContribAdminWrites created");
                  }
                });

                /*
                 * The view that sorts by the ids by dateModified.
                 */
                var sortByDateModified = "function (doc) {"
                    + "if (doc.dateModified) {"
                    + "emit(doc.dateModified, doc);" + "}" + "}";
                db.save("_design/get_ids", {
                  "language" : "javascript",
                  "views" : {
                    "by_date" : {
                      "map" : sortByDateModified
                    }
                  }
                }, function(err, doc) {
                  if (doc == undefined) {
                    doc = {
                      error : err
                    };
                  }
                  if (err != null || !doc.ok) {
                    console.log("Here are the errors " + util.inspect(err)
                        + " \n Here is the doc we get back "
                        + util.inspect(doc));
                  } else {
                    console.log("get_ids created");
                  }
                });

                if (typeof successcallback == "function") {
                  successcallback();
                }

              });// end createdb
        }
      });
};

/*
 * This function creates a new user's activity feed database
 * 
 * The db is composed of the pouchname
 */
var createDBforUsersActivities = function(dbConnection, user, successcallback,
    errorcallback) {
  console.log("Creating a new database/corpus: " + dbConnection.pouchname);
  var c = new cradle.Connection(dbConnection.protocol + dbConnection.domain,
      dbConnection.port, {
        auth : {
          username : couch_keys.username,
          password : couch_keys.password
        }
      // TODO make the username and password come from the user's default config
      // for their couch connection
      });
  var db = c.database(dbConnection.pouchname);
  db.exists(function(err, exists) {
    if (err) {
      console.log('error', err);
      if (typeof errorcallback == "function") {
        errorcallback(err);
      }
    } else if (exists) {
      console.log("The users activity db exists, calling the errorcallback.");
      var errmessage = 'The database already exists, this is problematic.';
      if (typeof errorcallback == "function") {
        errorcallback(errmessage);
      }
    } else {
      // Create database/corpus
      console.log('Database ' + dbConnection.pouchname
          + ' does not exist, creating it.');
      db.create(function(err, res) {
        console.log("In the callback of db create for "
            + dbConnection.pouchname);
        if (err) {
          console.log("Here is the err: " + err);
        }
        /*
         * Upon success of db creation, set up the collaborator, contributor and
         * admin roles for this corpus
         * 
         * Admins: Only the app is the admin Members: Only the user is a member
         * 
         * References: http://127.0.0.1:5984/john7corpus/_security
         */
        var securityParamsforNewDB = {
          "admins" : {
            "names" : [ '"fielddbdbadmin"' ],
            "roles" : []
          },
          "members" : {
            "names" : [ user.username ],
            "roles" : []
          }
        };
        db.save("_security", securityParamsforNewDB, function(err, doc) {
          if (doc == undefined) {
            doc = {
              error : err
            };
          }
          if (err != null || !doc.ok) {
            console.log("Here are the errors " + util.inspect(err)
                + " \n Here is the doc we get back " + util.inspect(doc));
          } else {
            console.log("_security created");
          }
        });

        /*
         * The view that sorts by the ids by dateModified.
         */
        var sortByDateModified = "function (doc) {" + "if (doc.dateModified) {"
            + "emit(doc.dateModified, doc);" + "}" + "}";
        db.save("_design/get_ids", {
          "language" : "javascript",
          "views" : {
            "by_date" : {
              "map" : sortByDateModified
            }
          }
        }, function(err, doc) {
          if (doc == undefined) {
            doc = {
              error : err
            };
          }
          if (err != null || !doc.ok) {
            console.log("Here are the errors " + util.inspect(err)
                + " \n Here is the doc we get back " + util.inspect(doc));
          } else {
            console.log("get_ids created");
          }
        });

        if (typeof successcallback == "function") {
          successcallback();
        }

      });// end createdb
    }
  });
};

/*
 * End couch functions
 */