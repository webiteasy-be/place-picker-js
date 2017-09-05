/*
 The MIT License (MIT)

 Copyright (c) 2017 Raphaël Joie

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

(function (root, factory) {
    "use strict";
    if (typeof define === 'function' && define.amd) { // jshint ignore:line
        // AMD. Register as an anonymous module.
        define(/*['jquery'],*/ factory); // jshint ignore:line
    } else { // noinspection JSUnresolvedVariable
        if (typeof module === 'object' && module.exports) { // jshint ignore:line
            // Node/CommonJS
            // noinspection JSUnresolvedVariable
            module.exports = factory(/*require('jquery')*/); // jshint ignore:line
        } else {
            // Browser globals
            var _PlacePicker = root && root.PlacePicker;
            var PlacePicker = factory(/*window.jQuery*/);
            root.PlacePicker = PlacePicker;
            root.PlacePicker.noConflict = function() {
                root.PlacePicker = _PlacePicker;
                return PlacePicker;
            }
        }
    }
}(this, function () {
    var template = '' +
        '<div class="backdrop" style="position: fixed; z-index: 1050; width: 100%; height: 100%; top:0; left:0; background-color: rgba(0,0,0,0.5);">' +
        '   <div style="width: 400px; margin: auto;">' +
        '       <input class="place-picker-search" style="width: 100%;" placeholder="Search place"/>' +
        '       <input class="place-picker-radius" style="width: 100%;" placeholder="radius"/>' +
        '       <div class="place-picker-map" style="height: 300px; width: 100%"></div>' +
        '       <input class="place-picker-submit" style="width: 100%;"/>' +
        '   </div>' +
        '</div>';

    var googleAsync = [];

    var NS = 'pp';

    var PlacePickerClass;

    var default_options = {
        framework: 'vanilla',
        backdropClassSelector: 'backdrop', /* class name in template to get backdrop */
        mapClassSelector: 'place-picker-map', /* class name in template to get radius input */
        searchClassSelector: 'place-picker-search', /* class name in template to get radius input */
        submitClassSelector: 'place-picker-submit', /* class name in template to get radius input */
        radiusEditClassSelector: 'place-picker-radius', /* class name in template to get radius input */
        format: '%r km around (%.2l, %,4L)',
        radius: 0,
        radiusUnits: 'km', /* m | km | mi | ft */
        latitude: 0,
        longitude: 0,
        commitOnClose: false, // TODO
        positionUnits: 'deg', /* deg | rad */
        latitudeInput: null, /* string (id), function or Element */
        longitudeInput: null, /* string (id), function or Element */
        radiusInput: null /* string (id), function or Element */
    };

    function _buildInput(pp, type){
        var attr = type + "Input";

        pp[attr] = document.createElement('input');
        pp[attr].type = 'hidden';
        pp[attr].name = type;
        pp.element.parentNode.insertBefore(pp[attr], pp.element);
    }

    function _ensureInput(pp, type){
        var attr = type + "Input";
        if (pp[attr])
            return;

        if ( typeof pp.options[attr] == 'string'){
            pp[attr] = document.getElementById(pp.options[attr]);
        } else if (typeof pp.options[attr] == 'function'){
            pp[attr] = pp.options[attr].call(pp);
        } else {
            pp[attr] = pp.options[attr];
        }

        if (!pp[attr] || pp[attr] == null)
            _buildInput(pp, type);
    }

    function _replaceNumber(template, tag, number) {
        var str = template.toString();
        var matcher = new RegExp("%(?:([,\.])([0-9]*))?" + tag, 'g' );
        var result;
        var out = str.toString();
        var precision, decimals, replacement;
        while((result = matcher.exec(str)) !== null){
            decimals = result[1] || '.';
            precision = parseInt(result[2]);
            if (result[2] == null || result[2] == undefined || result[2] == ''){
                replacement = number.toString();
            } else {
                replacement = number.toFixed(precision)
            }
            replacement = replacement.replace('.', decimals);
            out = out.replace(result[0], replacement);
        }
        return out;
    }

    PlacePickerClass = function(el, options){
        var self = this;

        if (el.placePicker){
            el.placePicker.destroy();
        }
        el.placePicker = this;

        var data_options={}, val, dataKey;

        for(var key in default_options) {
            dataKey = NS + key.charAt(0).toUpperCase() + key.slice(1);
            val = el.dataset[dataKey];

            if (val !== undefined)
                data_options[key] = val;
        }

        self.options = $.extend({}, default_options, data_options, options || {});

        self.element = el;

        self.build();
    };

    /**
     * Do NOT forget to call googleLoaded on PlacePicker object when Google SDK is loaded
     *
     * <script async defer src="https://maps.googleapis.com/maps/api/js?key=API_KEY&callback=initMaps" />
     * <script>
     *     function initMap(){
     *          PlacePicker.googleLoaded();
     *     }
     * </script>
     */
    PlacePickerClass.googleLoaded = function(){
        for(var i = 0; i < googleAsync.length ; i ++) {
            googleAsync[i]();
        }
        googleAsync = [];
    };

    PlacePickerClass.prototype = {
        constructor: PlacePickerClass,

        destroy: function() {
            var self = this;

            if (!self.picker)
                return;

            self.picker.parentNode.removeChild(self.picker);
            self.el.placePicker = null;
            // TODO remove listeners
        },

        build: function(){
            var self = this;

            if (self.picker)
                return;

            self.picker = document.createElement('div');
            self.picker.innerHTML = template;
            self.picker.style.display = 'none'; // TODO framework

            self.element.parentNode.insertBefore(self.picker, self.element);

            // TODO selectors
            self.mapEdit = self.picker.getElementsByClassName('place-picker-map')[0];
            self.searchEdit = self.picker.getElementsByClassName('place-picker-search')[0];
            self.submitEdit = self.picker.getElementsByClassName('place-picker-submit')[0];
            self.radiusEdit = self.picker.getElementsByClassName('place-picker-radius')[0];

            // Ensure latitude input
            _ensureInput(self, 'latitude');
            _ensureInput(self, 'longitude');
            _ensureInput(self, 'radius');

            self.element.addEventListener('focus', function(e){
                self.show();
            });

            self.picker.addEventListener('click', function(e){
                if (e.target.classList.contains(self.options.backdropClassSelector))
                    self.hide();
            });

            self.submitEdit.addEventListener('click', function(e){
                self.commit();
                self.hide();
            });

            if (self.searchEdit){
                self.searchEdit.addEventListener('keydown', function(e){
                    if(e.keyCode == 13) {
                        event.preventDefault();
                        return false;
                    }
                });
            }

            if (self.radiusEdit) {
                self.radiusEdit.addEventListener('change', function(e){
                    self.setRadius(parseInt(this.value))
                });
                self.radiusEdit.addEventListener('keydown', function(e){
                    if(e.keyCode == 13) {
                        event.preventDefault();
                        self.setRadius(parseInt(this.value));
                        return false;
                    }
                });
            }
        },

        show: function() {
            var self = this;
            self.picker.style.display = 'block';

            if (window.google) {
                self._initMap();
            } else {
                googleAsync.push(self._initMap);
            }
        },

        hide: function() {
            var self = this;
            self.picker.style.display = 'none';
        },

        setRadius: function(radius, units) {
            var self = this;

            switch (units || self.options.radiusUnits) {
                case 'km': radius = radius * 1000; break;
                case 'mi': radius = radius * 1609.34; break;
                case 'ft': radius = radius / 3.28084; break;
            }
            this.options.radius = radius;

            if (this.circle){
                this.circle.setRadius(this.options.radius);
            }
        },

        getRadius: function() {
            switch (this.options.radiusUnits){
                case 'km': return this.options.radius/1000;
                case 'mi': return this.options.radius/1609.34;
                case 'ft': return this.options.radius * 3.28084;
                default : return this.options.radius
            }
        },

        setPosition: function(position, units){
            // TODO units and use function if function
            var self = this;

            self.options.latitude = position.lat();
            self.options.longitude = position.lng();

            if (self.marker)
                self.marker.setPosition(position);

            if (self.circle)
                self.circle.setCenter(position);
        },

        getLatitude: function() {
            var self = this;

            return self.options.positionUnits == 'rad' ? self.options.latitude * Math.PI / 180 : self.options.latitude;
        },

        getLongitude: function() {
            var self = this;

            return self.options.positionUnits == 'rad' ? self.options.longitude * Math.PI / 180 : self.options.longitude
        },

        getPosition: function() {
            return {
                latitude: this.getLatitude(),
                longitude: this.getLongitude()
            }
        },

        commit: function() {
            var self = this;

            self.latitudeInput.value = self.getLatitude();
            self.longitudeInput.value = self.getLongitude();
            self.radiusInput.value = self.getRadius();

            var value = _replaceNumber(self.options.format, 'l', self.getLatitude());
            value = _replaceNumber(value, 'L', self.getLongitude());
            value = _replaceNumber(value, 'r', self.getRadius());

            self.element.value = value;
        },

        _initMap: function(){
            var self = this;

            var center = {
                lat: self.options.latitude,
                lng: self.options.longitude
            };

            if (self.map){
                // hack bootstrap modal !
                google.maps.event.trigger(self.map, 'resize');
                self.map.setCenter(center);

                return;
            }

            self.map = new google.maps.Map(self.mapEdit, {
                // TODO style in options
                zoom: 12,
                center: center
            });

            self.marker = new google.maps.Marker({
                position: center,
                map: self.map
            });

            if (self.radiusEdit){
                // TODO options
                self.circle = new google.maps.Circle({
                    strokeColor: '#FF0000',
                    strokeOpacity: 0.8,
                    strokeWeight: 2,
                    fillColor: '#FF0000',
                    fillOpacity: 0.35,
                    map: self.map,
                    center: center,
                    radius: self.options.radius
                });
            }

            self.map.addListener('center_changed', function() {
                self.setPosition(self.map.getCenter());
            });

            if (self.searchEdit) {
                // TODO test google.maps.places existence
                // Create the autocomplete object, restricting the search to geographical
                // location types.
                self.autocomplete = new google.maps.places.Autocomplete(
                    /** @type {!HTMLInputElement} */ self.searchEdit,
                    {types: ['geocode']});

                // When the user selects an address from the dropdown, populate the address
                // fields in the form.
                self.autocomplete.addListener('place_changed', function(){
                    // Get the place details from the autocomplete object.
                    var place = self.autocomplete.getPlace();

                    //console.log(place.geometry); todo map.setViewport(place.geometry.getViewport());
                    self.map.setCenter(place.geometry.location);
                });
            }
        }
    };

    return PlacePickerClass;
}));
