document.querySelectorAll('.faq_item').forEach((item) => {
	item.addEventListener('click', function () {
		console.log('Click');
		item.classList.toggle('active');
	});
});
