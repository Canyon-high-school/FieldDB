/* globals FieldDB */
'use strict';
console.log("Declaring the SpreadsheetDatum.");

var convertFieldDBDatumIntoSpreadSheetDatum = function(spreadsheetDatum, fieldDBDatum, guessedAudioUrl, $scope) {
  var j,
    fieldKeyName = "label";

  spreadsheetDatum.pouchname = fieldDBDatum.pouchname;
  spreadsheetDatum.id = fieldDBDatum._id;
  spreadsheetDatum.rev = fieldDBDatum._rev;

  for (j in fieldDBDatum.datumFields) {
    if (fieldDBDatum.datumFields[j].id && fieldDBDatum.datumFields[j].id.length > 0) {
      fieldKeyName = "id";
    } else {
      fieldKeyName = "label";
    }
    // Get enteredByUser object
    if (fieldDBDatum.datumFields[j][fieldKeyName] === "enteredByUser") {
      spreadsheetDatum.enteredByUser = fieldDBDatum.datumFields[j].user;
    } else if (fieldDBDatum.datumFields[j][fieldKeyName] === "modifiedByUser") {
      spreadsheetDatum.modifiedByUser = {
        users: fieldDBDatum.datumFields[j].users
      };
    } else if (fieldDBDatum.datumFields[j][fieldKeyName] === "comments") {
      // if their corpus has comments datum field, dont overwrite the comments with it ...
      console.log("This datum had a comments datum field... :( ", fieldDBDatum.datumFields[j], fieldDBDatum.comments);
    } else {
      spreadsheetDatum[fieldDBDatum.datumFields[j][fieldKeyName]] = fieldDBDatum.datumFields[j].mask;
    }
  }

  // Update enteredByUser for older records
  if (fieldDBDatum.enteredByUser && typeof fieldDBDatum.enteredByUser === "string") {
    spreadsheetDatum.enteredByUser = {
      username: fieldDBDatum.enteredByUser
    };
  }

  // Update to add a dateEntered to all datums (oversight in original spreadsheet code; needed so that datums are ordered properly)
  if (!fieldDBDatum.dateEntered || fieldDBDatum.dateEntered === "" || fieldDBDatum.dateEntered === "N/A") {
    spreadsheetDatum.dateEntered = "2000-09-06T16:31:30.988Z";
  } else {
    spreadsheetDatum.dateEntered = fieldDBDatum.dateEntered;
  }

  if (fieldDBDatum.dateModified) {
    spreadsheetDatum.dateModified = fieldDBDatum.dateModified;
  }

  // spreadsheetDatum.datumTags = fieldDBDatum.datumTags;
  spreadsheetDatum.comments = fieldDBDatum.comments;
  if (fieldDBDatum.session) {
    // spreadsheetDatum.sessionID = fieldDBDatum.session._id;
    spreadsheetDatum.session = fieldDBDatum.session;
  } else {
    window.alert("This record is missing a session, please report this to support@lingsync.org " + fieldDBDatum._id);
  }

  // upgrade to v1.90
  spreadsheetDatum.audioVideo = fieldDBDatum.audioVideo || [];
  if (!Array.isArray(spreadsheetDatum.audioVideo)) {
    // console.log("Upgrading audioVideo to a collection", spreadsheetDatum.audioVideo);
    var audioVideoArray = [];
    if (spreadsheetDatum.audioVideo.URL) {
      var audioVideoURL = spreadsheetDatum.audioVideo.URL;
      var fileFromUrl = audioVideoURL.substring(audioVideoURL.lastIndexOf("/"));
      audioVideoArray.push({
        "filename": fileFromUrl,
        "description": fileFromUrl,
        "URL": audioVideoURL,
        "type": "audio"
      });
    }
    spreadsheetDatum.audioVideo = audioVideoArray;
  }
  if (spreadsheetDatum.audioVideo.length === 0) {
    for (var key in fieldDBDatum._attachments) {
      var reconstructedAudioVideoItem = {
        "filename": key,
        "URL": guessedAudioUrl + spreadsheetDatum.id + "/" + key,
        "type": "audio",
        "description": ""
      };
      // if in the old spot pre v1.90 :
      if (fieldDBDatum.attachmentInfo && fieldDBDatum.attachmentInfo[key]) {
        reconstructedAudioVideoItem.description = fieldDBDatum.attachmentInfo[key].description;
      }
      spreadsheetDatum.audioVideo.push(reconstructedAudioVideoItem);
    }
  }

  // upgrade to 2.32+ use a fielddb audio video collection
  if (FieldDB && FieldDB.AudioVideos && Object.prototype.toString.call(spreadsheetDatum.audioVideo) === "[object Array]") {
    spreadsheetDatum.audioVideo = new FieldDB.AudioVideos(spreadsheetDatum.audioVideo);
  }

  // upgrade to v2.0+
  spreadsheetDatum.images = fieldDBDatum.images || [];
  fieldDBDatum.datumFields.map(function(datumField) {
    if (datumField[fieldKeyName] === "relatedData") {
      spreadsheetDatum.relatedData = datumField.json;
    }
  });
  spreadsheetDatum.relatedData = spreadsheetDatum.relatedData || [];

  // upgrade to v1.92
  var upgradedTags = spreadsheetDatum.tags ? spreadsheetDatum.tags.split(",") : [];
  if (fieldDBDatum.datumTags && fieldDBDatum.datumTags.length > 0) {
    console.log("Upgrading datumTags to a datumField", fieldDBDatum.datumTags);
    fieldDBDatum.datumTags.map(function(datumTag) {
      if (datumTag.tag) {
        upgradedTags.push(datumTag.tag.trim());
      } else {
        console.warn("This datum had datumTags but they were missing a tag inside", fieldDBDatum);
      }
    });
  }
  if (upgradedTags && upgradedTags.length > 0) {
    spreadsheetDatum.tags = [];
    upgradedTags.map(function(tag) {
      if (spreadsheetDatum.tags.indexOf(tag.trim()) === -1) {
        spreadsheetDatum.tags.push(tag.trim());
      }
    });
    spreadsheetDatum.tags = spreadsheetDatum.tags.join(", ");
  }
  spreadsheetDatum.datumTags = [];

  //TODO do we really need this flag?, yes we need it because the audio might be flagged as deleted
  spreadsheetDatum.hasAudio = false;
  if (spreadsheetDatum.audioVideo.length > 0) {
    spreadsheetDatum.audioVideo.map(function(audioVideo) {
      if (audioVideo.trashed !== "deleted") {
        spreadsheetDatum.hasAudio = true;
      }
    });
  }
  spreadsheetDatum.hasImages = false;
  if (spreadsheetDatum.images.length > 0) {
    spreadsheetDatum.images.map(function(image) {
      if (image.trashed !== "deleted") {
        spreadsheetDatum.hasImages = true;
      }
    });
  }
  spreadsheetDatum.hasRelatedData = false;
  if (spreadsheetDatum.relatedData.length > 0) {
    spreadsheetDatum.relatedData.map(function(relatedItem) {
      if (relatedItem.trashed !== "deleted") {
        spreadsheetDatum.hasRelatedData = true;
      }
    });
  }

  spreadsheetDatum.saved = "fresh";
  spreadsheetDatum.fossil = JSON.parse(JSON.stringify(spreadsheetDatum));
  spreadsheetDatum.markAsNeedsToBeSaved = function() {
    this.saved = "no";
    $scope.saved = "no";
    try {
      if (!$scope.$$phase) {
        $scope.$digest(); //$digest or $apply
      }
    } catch (e) {
      console.warn("Digest errored", e);
    }
  };
  return spreadsheetDatum;
};

var convertSpreadSheetDatumIntoFieldDBDatum = function(spreadsheetDatum, fieldDBDatum) {
  var key,
    hasModifiedByUser,
    spreadsheetKeyWasInDatumFields,
    fieldKeyName = "label",
    i;

  if (fieldDBDatum._id && fieldDBDatum.pouchname !== spreadsheetDatum.pouchname) {
    throw ("This record belongs to another corpus.");
  }
  console.log(fieldDBDatum);
  for (key in spreadsheetDatum) {
    spreadsheetKeyWasInDatumFields = false;

    /* find the datum field that corresponds to this key in the spreadsheetDatum */
    for (i = 0; i < fieldDBDatum.datumFields.length; i++) {
      if (fieldDBDatum.datumFields[i].id) {
        fieldKeyName = "id";
      }
      if (fieldDBDatum.datumFields[i][fieldKeyName] === key) {
        spreadsheetKeyWasInDatumFields = true;
        // Check for (existing) modifiedByUser field in original record and update correctly
        if (key === "modifiedByUser") {
          hasModifiedByUser = true;
          fieldDBDatum.datumFields[i].users = spreadsheetDatum.modifiedByUser.users;
          // fieldDBDatum.datumFields[i].mask = spreadsheetDatum.modifiedByUser.users; /TODO
          // fieldDBDatum.datumFields[i].value = spreadsheetDatum.modifiedByUser.users; /TODO
          fieldDBDatum.datumFields[i].readonly = true;
        } else if (key === "enteredByUser") {
          fieldDBDatum.datumFields[i].user = spreadsheetDatum.enteredByUser;
          fieldDBDatum.datumFields[i].mask = spreadsheetDatum.enteredByUser.username;
          fieldDBDatum.datumFields[i].value = spreadsheetDatum.enteredByUser.username;
          fieldDBDatum.datumFields[i].readonly = true;
        } else if (key === "comments") {
          //dont put the comments into the comments datum field if their corpus has one...
          if (typeof fieldDBDatum.datumFields[i].value !== "string") {
            fieldDBDatum.datumFields[i].value = "";
            fieldDBDatum.datumFields[i].mask = "";
          }
        } else {
          fieldDBDatum.datumFields[i].value = spreadsheetDatum[key];
          fieldDBDatum.datumFields[i].mask = spreadsheetDatum[key];
        }
      }
    }

    /* If the key isnt empty, and it wasnt in the existing datum fields, and its not a spreadsheet internal thing, create a datum field */
    if (spreadsheetDatum[key] !== undefined && !spreadsheetKeyWasInDatumFields && key !== "hasAudio" && key !== "hasImages" && key !== "hasRelatedData" && key !== "markAsNeedsToBeSaved" && key !== "saved" && key !== "fossil" && key !== "checked" && key !== "session" && key !== "pouchname" && key !== "$$hashKey" && key !== "audioVideo" && key !== "images" && key !== "relatedData" && key !== "comments" && key !== "sessionID" && key !== "modifiedByUser" && key !== "enteredByUser" && key !== "id" && key !== "rev" && key !== "dateEntered" && key !== "datumTags" && key !== "timestamp" && key !== "dateModified" && key !== "lastModifiedBy") {

      fieldDBDatum.datumFields.push({
        "label": key,
        "value": spreadsheetDatum[key] || "",
        "mask": spreadsheetDatum[key] || "",
        "encrypted": "",
        "shouldBeEncrypted": "checked",
        "help": "Entered by user in Field Methods App, conventions are not known.",
        "showToUserTypes": "linguist",
        "userchooseable": "disabled"
      });
    }
  }

  /* Add modifiedByUser field if not present */
  if (hasModifiedByUser === false) {
    console.log("Adding modifiedByUser field to older record.");
    var modifiedByUserField = {
      "label": "modifiedByUser",
      "mask": "",
      "value": "",
      "users": spreadsheetDatum.modifiedByUser.users,
      "encrypted": "",
      "shouldBeEncrypted": "",
      "help": "An array of users who modified the datum",
      "showToUserTypes": "all",
      "readonly": true,
      "userchooseable": "disabled"
    };
    fieldDBDatum.datumFields.push(modifiedByUserField);
  }

  // Save date info
  fieldDBDatum.dateModified = spreadsheetDatum.dateModified;
  // fieldDBDatum.lastModifiedBy = spreadsheetDatum.lastModifiedBy;
  fieldDBDatum.timestamp = spreadsheetDatum.timestamp;
  fieldDBDatum.session = spreadsheetDatum.session;
  fieldDBDatum.pouchname = spreadsheetDatum.pouchname;
  fieldDBDatum.dateEntered = spreadsheetDatum.dateEntered;


  /* TODO tags shouldn't be in the datum they were deprecated in v40ish before the spreadsheet was created... */
  // if (spreadsheetDatum.datumTags && spreadsheetDatum.datumTags.length > 0) {
  // }
  fieldDBDatum.datumTags = spreadsheetDatum.datumTags;
  // Save comments TODO what if someone else modified it? need to merge the info...
  if (spreadsheetDatum.comments && spreadsheetDatum.comments.length > 0) {
    fieldDBDatum.comments = spreadsheetDatum.comments;
  }
  // Save audioVideo TODO what if someone else modified it? need to merge the info...
  if (spreadsheetDatum.audioVideo && spreadsheetDatum.audioVideo.length > 0) {
    fieldDBDatum.audioVideo = spreadsheetDatum.audioVideo.toJSON();
  }
  // Save images TODO what if someone else modified it? need to merge the info...
  if (spreadsheetDatum.images && spreadsheetDatum.images.length > 0) {
    fieldDBDatum.images = spreadsheetDatum.images;
  }
  // Save relatedData TODO what if someone else modified it? need to merge the info...
  if (spreadsheetDatum.relatedData && spreadsheetDatum.relatedData.length > 0) {
    fieldDBDatum.datumFields.map(function(datumField) {
      if (datumField[fieldKeyName] === "relatedData") {
        datumField.json = spreadsheetDatum.relatedData;
        datumField.value = spreadsheetDatum.relatedData.map(function(json) {
          return json.filename;
        });
        datumField.mask = datumField.value;
      }
    });
  }
  // Save attachments TODO what if someone else modified it? need to merge the info...
  if (spreadsheetDatum._attachments && spreadsheetDatum._attachments !== {}) {
    fieldDBDatum._attachments = spreadsheetDatum._attachments;
  }

  // upgrade to v1.90
  if (fieldDBDatum.attachmentInfo) {
    delete fieldDBDatum.attachmentInfo;
  }

  return fieldDBDatum;
};
console.log("Loaded the SpreadsheetDatum.");

var SpreadsheetDatum = {
  convertSpreadSheetDatumIntoFieldDBDatum: convertSpreadSheetDatumIntoFieldDBDatum,
  convertFieldDBDatumIntoSpreadSheetDatum: convertFieldDBDatumIntoSpreadSheetDatum
};
console.log("SpreadsheetDatum", SpreadsheetDatum);
